using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Options;

namespace MishkatulIlm_Server.Services.Flutterwave;

public sealed class FlutterwavePaymentService(
    AppDbContext db,
    FlutterwaveApiClient apiClient,
    LessonBillingContextService billingContext,
    SchedulingSettingsService schedulingSettings,
    AdminPaymentSubmissionService adminPayments,
    IOptions<FlutterwaveOptions> options,
    ILogger<FlutterwavePaymentService> logger)
{
    public async Task<(bool Success, string? Error, string? CheckoutUrl, PaymentSubmission? Submission)> InitiateCheckoutAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        if (!options.Value.IsConfigured)
            return (false, "Online payments are not configured yet.", null, null);

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);
        if (user is null)
            return (false, "Account not found.", null, null);

        if (user.ApplicationStatus != ApplicationStatusCodes.Active)
            return (false, "Payments are available after you accept your lesson schedule.", null, null);

        var utcNow = DateTime.UtcNow;
        var billing = await billingContext.ResolveAsync(user, utcNow, cancellationToken);
        var existing = await db.PaymentSubmissions
            .Where(s => s.StudentUserId == userId && s.BillingYear == billing.BillingYear && s.BillingMonth == billing.BillingMonth)
            .OrderByDescending(s => s.SubmittedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (existing?.Status == PaymentSubmissionStatusCodes.Paid)
            return (false, "This billing period is already marked as paid.", null, null);

        if (existing?.Status == PaymentSubmissionStatusCodes.PendingVerification
            && !string.IsNullOrWhiteSpace(existing.FlutterwaveCheckoutSessionId))
        {
            var resumeUrl = await TryResolveCheckoutUrlAsync(existing.FlutterwaveCheckoutSessionId, cancellationToken);
            if (!string.IsNullOrWhiteSpace(resumeUrl))
                return (true, null, resumeUrl, existing);
        }

        var lessons = await billingContext.LoadBillableLessonsAsync(billing, userId, cancellationToken);
        var settings = await schedulingSettings.GetEntityAsync(cancellationToken);
        var statement = LessonBillingService.BuildStatement(
            user,
            lessons,
            settings,
            billing.BillingYear,
            billing.BillingMonth,
            existing,
            utcNow,
            billing.IsRolloverBlock && billing.PlannedRollover is { Count: > 0 }
                ? LessonBillingService.FormatRolloverBillingPeriod(billing.PlannedRollover)
                : null,
            billing.IsRolloverBlock);

        if (statement.TotalAmount <= 0)
            return (false, "There are no billable lessons for this billing period.", null, null);

        var summary = StudentPaymentSummaryBuilder.Build(user, existing, utcNow, billing);
        var resumingPending = existing?.Status == PaymentSubmissionStatusCodes.PendingVerification;
        if (!summary.CanSubmitPayment && !resumingPending)
            return (false, "Payment submission is not available right now.", null, null);

        var reference = FlutterwaveReferenceHelper.Create();
        string customerId;
        try
        {
            customerId = await EnsureCustomerAsync(user, cancellationToken);
        }
        catch (FlutterwaveApiException ex)
        {
            logger.LogWarning(ex, "Flutterwave customer creation failed for user {UserId}.", userId);
            return (false, ex.Message, null, null);
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "Flutterwave customer creation failed for user {UserId}.", userId);
            return (false, ex.Message, null, null);
        }

        var redirectUrl = ResolvePaymentRedirectUrl(reference);
        var traceId = $"mi-chk-{Guid.NewGuid():N}";
        var idempotencyKey = $"mi-chk-{reference}";

        JsonDocument response;
        try
        {
            response = await apiClient.PostAsync(
                "/checkout/sessions",
                new
                {
                    amount = statement.TotalAmount,
                    currency = statement.Currency,
                    customer_id = customerId,
                    redirect_url = redirectUrl,
                    reference,
                    session_duration = 60,
                },
                traceId,
                idempotencyKey,
                cancellationToken);
        }
        catch (FlutterwaveApiException ex)
        {
            logger.LogWarning(ex, "Flutterwave checkout session failed for user {UserId}.", userId);
            return (false, ex.Message, null, null);
        }

        string? checkoutUrl;
        string externalId;
        using (response)
        {
            var root = response.RootElement;
            if (!string.Equals(root.GetProperty("status").GetString(), "success", StringComparison.OrdinalIgnoreCase))
            {
                var message = TryReadErrorMessage(root) ?? "Could not start Flutterwave checkout.";
                return (false, message, null, null);
            }

            var data = root.GetProperty("data");
            externalId = data.GetProperty("id").GetString() ?? string.Empty;
            checkoutUrl = TryReadCheckoutUrl(data);
            if (string.IsNullOrWhiteSpace(checkoutUrl))
                checkoutUrl = await TryResolveCheckoutUrlAsync(externalId, cancellationToken);
        }

        if (string.IsNullOrWhiteSpace(checkoutUrl))
        {
            var orchestrated = await TryOrchestratorHostedCheckoutAsync(
                user,
                statement.TotalAmount,
                statement.Currency,
                reference,
                redirectUrl,
                cancellationToken);
            if (!orchestrated.Success)
            {
                logger.LogWarning(
                    "Flutterwave checkout session {SessionId} had no checkout URL and orchestrator fallback failed: {Error}",
                    externalId,
                    orchestrated.Error);
                return (false, orchestrated.Error ?? "Could not open the payment page. Please try again.", null, null);
            }

            checkoutUrl = orchestrated.CheckoutUrl;
            externalId = orchestrated.ExternalId ?? externalId;
        }

        if (string.IsNullOrWhiteSpace(checkoutUrl))
            return (false, "Flutterwave did not return a checkout URL.", null, null);

        var submission = existing ?? new PaymentSubmission
        {
            Id = Guid.NewGuid(),
            StudentUserId = userId,
            BillingYear = billing.BillingYear,
            BillingMonth = billing.BillingMonth,
        };

        submission.Status = PaymentSubmissionStatusCodes.PendingVerification;
        submission.Amount = statement.TotalAmount;
        submission.Currency = statement.Currency;
        submission.PaymentReference = reference;
        submission.SubmittedAtUtc = utcNow;
        submission.FlutterwaveCheckoutSessionId = externalId;
        submission.FlutterwaveTransactionId = null;
        submission.ReviewedAtUtc = null;
        submission.ReviewedByAdminUserId = null;
        submission.AdminNote = null;

        if (existing is null)
            db.PaymentSubmissions.Add(submission);
        else
            db.PaymentSubmissions.Update(submission);

        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation(
            "Created Flutterwave checkout {ExternalId} for user {UserId} reference {Reference}.",
            externalId,
            userId,
            reference);

        return (true, null, checkoutUrl, submission);
    }

    public async Task<(bool Success, string? Error, string? Message)> TryCompleteByReferenceAsync(
        Guid userId,
        string reference,
        string? transactionId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(reference))
            return (false, "Payment reference is required.", null);

        var submission = await db.PaymentSubmissions
            .Include(s => s.Student)
            .FirstOrDefaultAsync(
                s => s.PaymentReference == reference && s.StudentUserId == userId,
                cancellationToken);

        if (submission is null)
            return (false, "Payment submission not found.", null);

        if (submission.Status == PaymentSubmissionStatusCodes.Paid)
            return (true, null, "Payment already recorded.");

        if (submission.Status != PaymentSubmissionStatusCodes.PendingVerification)
            return (false, "This payment can no longer be completed.", null);

        var chargeId = transactionId;
        if (string.IsNullOrWhiteSpace(chargeId))
        {
            chargeId = await FindSuccessfulChargeIdAsync(reference, submission.Amount, submission.Currency, cancellationToken);
            if (string.IsNullOrWhiteSpace(chargeId))
                return (false, "Payment has not been confirmed yet. Please wait a moment and refresh.", null);
        }

        var verified = await VerifyChargeAsync(chargeId, submission.Amount, submission.Currency, cancellationToken);
        if (!verified)
            return (false, "Payment verification failed. Contact support if you were charged.", null);

        submission.FlutterwaveTransactionId = chargeId;
        return await MarkSubmissionPaidAsync(submission, cancellationToken);
    }

    public async Task<(bool Success, string? Error, string? Message)> TryCompleteFromWebhookAsync(
        string reference,
        string chargeId,
        decimal amount,
        string currency,
        CancellationToken cancellationToken = default)
    {
        var submission = await db.PaymentSubmissions
            .Include(s => s.Student)
            .FirstOrDefaultAsync(s => s.PaymentReference == reference, cancellationToken);

        if (submission is null)
        {
            logger.LogWarning("Flutterwave webhook for unknown reference {Reference}.", reference);
            return (false, "Submission not found.", null);
        }

        if (submission.Status == PaymentSubmissionStatusCodes.Paid)
            return (true, null, "Already paid.");

        if (!VerifyAmount(submission.Amount, amount) || !string.Equals(submission.Currency, currency, StringComparison.OrdinalIgnoreCase))
        {
            logger.LogWarning(
                "Flutterwave webhook amount/currency mismatch for {Reference}. Expected {Amount} {Currency}, got {WebhookAmount} {WebhookCurrency}.",
                reference,
                submission.Amount,
                submission.Currency,
                amount,
                currency);
            return (false, "Amount mismatch.", null);
        }

        var verified = await VerifyChargeAsync(chargeId, submission.Amount, submission.Currency, cancellationToken);
        if (!verified)
            return (false, "Charge verification failed.", null);

        submission.FlutterwaveTransactionId = chargeId;
        return await MarkSubmissionPaidAsync(submission, cancellationToken);
    }

    private Task<(bool Success, string? Error, string? Message)> MarkSubmissionPaidAsync(
        PaymentSubmission submission,
        CancellationToken cancellationToken) =>
        adminPayments.ApproveAutomaticallyAsync(submission.Id, cancellationToken);

    private async Task<string> EnsureCustomerAsync(AppUser user, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(user.FlutterwaveCustomerId))
            return user.FlutterwaveCustomerId;

        var traceId = $"mi-cus-{Guid.NewGuid():N}";
        using var response = await apiClient.PostAsync(
            "/customers",
            new
            {
                email = user.Email,
                name = new
                {
                    first = string.IsNullOrWhiteSpace(user.FirstName) ? "Student" : user.FirstName,
                    last = string.IsNullOrWhiteSpace(user.LastName) ? "User" : user.LastName,
                },
            },
            traceId,
            $"mi-cus-{user.Id:N}",
            cancellationToken);

        var root = response.RootElement;
        if (!string.Equals(root.GetProperty("status").GetString(), "success", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException(TryReadErrorMessage(root) ?? "Could not create Flutterwave customer.");

        var customerId = root.GetProperty("data").GetProperty("id").GetString()
            ?? throw new InvalidOperationException("Flutterwave customer response missing id.");

        user.FlutterwaveCustomerId = customerId;
        await db.SaveChangesAsync(cancellationToken);
        return customerId;
    }

    private async Task<string?> TryResolveCheckoutUrlAsync(string externalId, CancellationToken cancellationToken)
    {
        try
        {
            if (externalId.StartsWith("chg_", StringComparison.OrdinalIgnoreCase))
            {
                using var chargeResponse = await apiClient.GetAsync(
                    $"/charges/{Uri.EscapeDataString(externalId)}",
                    $"mi-chg-get-{Guid.NewGuid():N}",
                    cancellationToken);
                var chargeRoot = chargeResponse.RootElement;
                if (!string.Equals(chargeRoot.GetProperty("status").GetString(), "success", StringComparison.OrdinalIgnoreCase))
                    return null;

                return TryReadCheckoutUrl(chargeRoot.GetProperty("data"));
            }

            using var response = await apiClient.GetAsync(
                $"/checkout/sessions/{externalId}",
                $"mi-chk-get-{Guid.NewGuid():N}",
                cancellationToken);
            var root = response.RootElement;
            if (!string.Equals(root.GetProperty("status").GetString(), "success", StringComparison.OrdinalIgnoreCase))
                return null;

            var data = root.GetProperty("data");
            return TryReadCheckoutUrl(data);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not resolve Flutterwave checkout URL for {ExternalId}.", externalId);
            return null;
        }
    }

    private async Task<(bool Success, string? Error, string? CheckoutUrl, string? ExternalId)> TryOrchestratorHostedCheckoutAsync(
        AppUser user,
        decimal amount,
        string currency,
        string reference,
        string redirectUrl,
        CancellationToken cancellationToken)
    {
        if (!redirectUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            return (false,
                "Flutterwave requires an HTTPS return URL. Set Flutterwave:PaymentRedirectUrl to your public HTTPS student dashboard URL.",
                null,
                null);
        }

        var paymentMethodType = string.Equals(currency, "NGN", StringComparison.OrdinalIgnoreCase)
            ? "opay"
            : "googlepay";

        var traceId = $"mi-orc-{Guid.NewGuid():N}";
        try
        {
            using var response = await apiClient.PostAsync(
                "/orchestration/direct-charges",
                new
                {
                    amount,
                    currency,
                    reference,
                    redirect_url = redirectUrl,
                    customer = new
                    {
                        email = user.Email,
                        name = new
                        {
                            first = string.IsNullOrWhiteSpace(user.FirstName) ? "Student" : user.FirstName,
                            last = string.IsNullOrWhiteSpace(user.LastName) ? "User" : user.LastName,
                        },
                    },
                    payment_method = new { type = paymentMethodType },
                },
                traceId,
                $"mi-orc-{reference}",
                cancellationToken);

            var root = response.RootElement;
            if (!string.Equals(root.GetProperty("status").GetString(), "success", StringComparison.OrdinalIgnoreCase))
            {
                var message = TryReadErrorMessage(root) ?? "Could not start Flutterwave payment.";
                return (false, message, null, null);
            }

            var data = root.GetProperty("data");
            var externalId = data.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
            var checkoutUrl = TryReadCheckoutUrl(data);
            if (string.IsNullOrWhiteSpace(checkoutUrl))
                return (false, "Flutterwave did not return a checkout URL.", null, externalId);

            return (true, null, checkoutUrl, externalId);
        }
        catch (FlutterwaveApiException ex)
        {
            return (false, ex.Message, null, null);
        }
    }

    private async Task<string?> FindSuccessfulChargeIdAsync(
        string reference,
        decimal expectedAmount,
        string expectedCurrency,
        CancellationToken cancellationToken)
    {
        try
        {
            using var response = await apiClient.GetAsync(
                $"/charges?reference={Uri.EscapeDataString(reference)}",
                $"mi-chg-list-{Guid.NewGuid():N}",
                cancellationToken);

            var root = response.RootElement;
            if (!root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
                return null;

            foreach (var charge in data.EnumerateArray())
            {
                var id = charge.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
                var status = charge.TryGetProperty("status", out var statusEl) ? statusEl.GetString() : null;
                var amount = charge.TryGetProperty("amount", out var amountEl) ? amountEl.GetDecimal() : 0m;
                var currency = charge.TryGetProperty("currency", out var currencyEl) ? currencyEl.GetString() : null;

                if (string.IsNullOrWhiteSpace(id))
                    continue;

                if (!IsSuccessfulStatus(status))
                    continue;

                if (!VerifyAmount(expectedAmount, amount))
                    continue;

                if (!string.Equals(expectedCurrency, currency, StringComparison.OrdinalIgnoreCase))
                    continue;

                return id;
            }
        }
        catch (FlutterwaveApiException ex)
        {
            logger.LogWarning(ex, "Flutterwave charge lookup failed for reference {Reference}.", reference);
        }

        return null;
    }

    private async Task<bool> VerifyChargeAsync(
        string chargeId,
        decimal expectedAmount,
        string expectedCurrency,
        CancellationToken cancellationToken)
    {
        try
        {
            using var response = await apiClient.GetAsync(
                $"/charges/{Uri.EscapeDataString(chargeId)}",
                $"mi-chg-get-{Guid.NewGuid():N}",
                cancellationToken);

            var root = response.RootElement;
            if (!string.Equals(root.GetProperty("status").GetString(), "success", StringComparison.OrdinalIgnoreCase))
                return false;

            var data = root.GetProperty("data");
            var status = data.TryGetProperty("status", out var statusEl) ? statusEl.GetString() : null;
            var amount = data.TryGetProperty("amount", out var amountEl) ? amountEl.GetDecimal() : 0m;
            var currency = data.TryGetProperty("currency", out var currencyEl) ? currencyEl.GetString() : null;

            return IsSuccessfulStatus(status)
                && VerifyAmount(expectedAmount, amount)
                && string.Equals(expectedCurrency, currency, StringComparison.OrdinalIgnoreCase);
        }
        catch (FlutterwaveApiException ex)
        {
            logger.LogWarning(ex, "Flutterwave charge verification failed for {ChargeId}.", chargeId);
            return false;
        }
    }

    private static bool IsSuccessfulStatus(string? status) =>
        string.Equals(status, "successful", StringComparison.OrdinalIgnoreCase)
        || string.Equals(status, "succeeded", StringComparison.OrdinalIgnoreCase)
        || string.Equals(status, "completed", StringComparison.OrdinalIgnoreCase);

    private static bool VerifyAmount(decimal expected, decimal actual) =>
        Math.Abs(expected - actual) < 0.01m;

    private string ResolvePaymentRedirectUrl(string reference)
    {
        var configured = options.Value.PaymentRedirectUrl.Trim();
        var baseUrl = !string.IsNullOrWhiteSpace(configured)
            ? configured.TrimEnd('/')
            : options.Value.ClientAppUrl.TrimEnd('/');

        return $"{baseUrl}/student-dashboard?payment=flutterwave&reference={Uri.EscapeDataString(reference)}";
    }

    /// <summary>
    /// v4 checkout URL from API response only — never constructed manually.
    /// </summary>
    private static string? TryReadCheckoutUrl(JsonElement data)
    {
        if (data.TryGetProperty("checkout_url", out var checkoutUrlEl))
        {
            var checkoutUrl = checkoutUrlEl.GetString();
            if (!string.IsNullOrWhiteSpace(checkoutUrl))
                return checkoutUrl;
        }

        if (data.TryGetProperty("link", out var linkEl))
        {
            var link = linkEl.GetString();
            if (!string.IsNullOrWhiteSpace(link))
                return link;
        }

        if (data.TryGetProperty("next_action", out var nextActionEl)
            && nextActionEl.TryGetProperty("redirect_url", out var redirectUrlEl)
            && redirectUrlEl.TryGetProperty("url", out var urlEl))
        {
            var url = urlEl.GetString();
            if (!string.IsNullOrWhiteSpace(url))
                return url;
        }

        return null;
    }

    private static string? TryReadErrorMessage(JsonElement root)
    {
        if (root.TryGetProperty("error", out var error) && error.TryGetProperty("message", out var message))
            return message.GetString();
        if (root.TryGetProperty("message", out var topMessage))
            return topMessage.GetString();
        return null;
    }
}

public static class FlutterwaveReferenceHelper
{
    public static string Create() => $"MK{Guid.NewGuid():N}";
}
