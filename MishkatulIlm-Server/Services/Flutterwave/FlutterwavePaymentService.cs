using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Options;

namespace MishkatulIlm_Server.Services.Flutterwave;

public sealed class FlutterwavePaymentService(
    AppDbContext db,
    FlutterwaveApiClient apiClient,
    FlutterwaveStandardApiClient standardApiClient,
    LessonBillingContextService billingContext,
    SchedulingSettingsService schedulingSettings,
    AdminPaymentSubmissionService adminPayments,
    IOptions<FlutterwaveOptions> options,
    IConfiguration configuration,
    ILogger<FlutterwavePaymentService> logger)
{
    public async Task<(bool Success, string? Error, string? CheckoutUrl, PaymentSubmission? Submission)> InitiateCheckoutAsync(
        Guid userId,
        string? clientOrigin = null,
        CancellationToken cancellationToken = default)
    {
        if (!options.Value.CanAcceptPayments)
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
            && !string.IsNullOrWhiteSpace(existing.FlutterwaveCheckoutSessionId)
            && !ShouldStartFreshCheckout(existing.FlutterwaveCheckoutSessionId))
        {
            var resumeUrl = await TryResolveCheckoutUrlAsync(existing.FlutterwaveCheckoutSessionId, cancellationToken);
            if (!string.IsNullOrWhiteSpace(resumeUrl))
                return (true, null, resumeUrl, existing);
        }

        var lessons = await billingContext.LoadBillableLessonsAsync(billing, userId, utcNow, cancellationToken);
        var settings = await schedulingSettings.GetEntityAsync(cancellationToken);
        string? labelOverride = null;
        var billEntireList = false;
        if (billing.IsRolloverBlock && billing.PlannedRollover is { Count: > 0 })
        {
            labelOverride = LessonBillingService.FormatRolloverBillingPeriod(billing.PlannedRollover);
            billEntireList = true;
        }
        else if (user.LastPaymentAtUtc is null && lessons.Count > 0)
        {
            labelOverride = LessonBillingService.FormatUpcomingLessonsPeriod(lessons);
            billEntireList = true;
        }

        var statement = LessonBillingService.BuildStatement(
            user,
            lessons,
            settings,
            billing.BillingYear,
            billing.BillingMonth,
            existing,
            utcNow,
            labelOverride,
            billEntireList);

        if (statement.TotalAmount <= 0)
            return (false, "There are no billable lessons for this billing period.", null, null);

        var summary = StudentPaymentSummaryBuilder.Build(user, existing, utcNow, billing);
        var resumingPending = existing?.Status == PaymentSubmissionStatusCodes.PendingVerification;
        if (!summary.CanSubmitPayment && !resumingPending)
            return (false, "Payment submission is not available right now.", null, null);

        var reference = FlutterwaveReferenceHelper.Create();
        var redirectUrl = ResolvePaymentRedirectUrl(reference, clientOrigin);
        var orchestratorRedirectUrl = ResolveOrchestratorRedirectUrl(reference, clientOrigin);

        string? checkoutUrl = null;
        string externalId = reference;
        string? lastError = null;

        if (options.Value.HasStandardHostedCheckout)
        {
            var standard = await TryStandardHostedCheckoutAsync(
                user,
                statement.TotalAmount,
                statement.Currency,
                reference,
                redirectUrl,
                cancellationToken);
            if (standard.Success)
                checkoutUrl = standard.CheckoutUrl;
            else
                lastError = standard.Error;
        }

        if (string.IsNullOrWhiteSpace(checkoutUrl)
            && options.Value.IsConfigured
            && !options.Value.HasStandardHostedCheckout)
        {
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

            var orchestrated = await TryOrchestratorHostedCheckoutAsync(
                user,
                statement.TotalAmount,
                statement.Currency,
                reference,
                orchestratorRedirectUrl,
                cancellationToken);
            if (orchestrated.Success)
            {
                checkoutUrl = orchestrated.CheckoutUrl;
                externalId = orchestrated.ExternalId ?? reference;
            }
            else
            {
                lastError = orchestrated.Error;
                var session = await TryCreateCheckoutSessionUrlAsync(
                    customerId,
                    statement.TotalAmount,
                    statement.Currency,
                    redirectUrl,
                    reference,
                    cancellationToken);
                checkoutUrl = session.CheckoutUrl;
                if (!string.IsNullOrWhiteSpace(session.SessionId))
                    externalId = session.SessionId;
            }
        }

        if (string.IsNullOrWhiteSpace(checkoutUrl))
        {
            logger.LogWarning(
                "Flutterwave hosted checkout failed for reference {Reference}: {Error}",
                reference,
                lastError);
            return (false, lastError ?? "Could not open the payment page. Please try again.", null, null);
        }

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

    private async Task<(bool Success, string? Error, string? CheckoutUrl)> TryStandardHostedCheckoutAsync(
        AppUser user,
        decimal amount,
        string currency,
        string reference,
        string redirectUrl,
        CancellationToken cancellationToken)
    {
        if (!redirectUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
            && !options.Value.IsSandbox)
        {
            return (false,
                "Flutterwave requires an HTTPS return URL in production. Set Flutterwave:ClientAppUrl to your public HTTPS site URL.",
                null);
        }

        var (first, last) = FlutterwaveCustomerNameHelper.Resolve(user.FirstName, user.LastName);
        try
        {
            using var response = await standardApiClient.PostAsync(
                "/v3/payments",
                new
                {
                    tx_ref = reference,
                    amount,
                    currency,
                    redirect_url = redirectUrl,
                    payment_options = "card",
                    customer = new
                    {
                        email = user.Email,
                        name = $"{first} {last}".Trim(),
                    },
                    customizations = new
                    {
                        title = "Al Usooliyyah Academy",
                        description = "Lesson payment",
                    },
                    configurations = new
                    {
                        session_duration = 60,
                        max_retry_attempt = 3,
                    },
                },
                cancellationToken);

            var root = response.RootElement;
            if (!string.Equals(root.GetProperty("status").GetString(), "success", StringComparison.OrdinalIgnoreCase))
                return (false, TryReadErrorMessage(root) ?? "Could not start Flutterwave checkout.", null);

            var link = TryReadCheckoutUrl(root.GetProperty("data"));
            if (string.IsNullOrWhiteSpace(link))
                return (false, "Flutterwave did not return a checkout URL.", null);

            logger.LogInformation(
                "Flutterwave Standard hosted checkout started for reference {Reference}.",
                reference);

            return (true, null, link);
        }
        catch (FlutterwaveApiException ex)
        {
            logger.LogWarning(ex, "Flutterwave Standard checkout failed for reference {Reference}.", reference);
            return (false, ex.Message, null);
        }
    }

    private async Task<(string? CheckoutUrl, string? SessionId)> TryCreateCheckoutSessionUrlAsync(
        string customerId,
        decimal amount,
        string currency,
        string redirectUrl,
        string reference,
        CancellationToken cancellationToken)
    {
        var traceId = $"mi-chk-{Guid.NewGuid():N}";
        var idempotencyKey = $"mi-chk-{reference}";

        try
        {
            using var response = await apiClient.PostAsync(
                "/checkout/sessions",
                new
                {
                    amount,
                    currency,
                    customer_id = customerId,
                    redirect_url = redirectUrl,
                    reference,
                    session_duration = 60,
                },
                traceId,
                idempotencyKey,
                cancellationToken);

            var root = response.RootElement;
            if (!string.Equals(root.GetProperty("status").GetString(), "success", StringComparison.OrdinalIgnoreCase))
                return (null, null);

            var data = root.GetProperty("data");
            var sessionId = data.GetProperty("id").GetString();
            var checkoutUrl = TryReadCheckoutUrl(data);
            if (string.IsNullOrWhiteSpace(checkoutUrl) && !string.IsNullOrWhiteSpace(sessionId))
                checkoutUrl = await TryResolveCheckoutUrlAsync(sessionId, cancellationToken);

            return (checkoutUrl, sessionId);
        }
        catch (FlutterwaveApiException ex)
        {
            logger.LogWarning(ex, "Flutterwave checkout session failed for reference {Reference}.", reference);
            return (null, null);
        }
    }

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
                name = FlutterwaveCustomerNameHelper.Build(user),
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

    private bool ShouldStartFreshCheckout(string externalId)
    {
        // v4 orchestrator wallet charges (Apple/Google Pay) must not be resumed — redirect tokens expire
        // and we prefer v3 Standard hosted card checkout when configured.
        if (externalId.StartsWith("chg_", StringComparison.OrdinalIgnoreCase))
            return true;

        if (options.Value.HasStandardHostedCheckout
            && !externalId.StartsWith("che_", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return false;
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
        if (!redirectUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
            && !options.Value.IsSandbox)
        {
            return (false,
                "Flutterwave requires an HTTPS return URL in production. Set Flutterwave:ClientAppUrl to your public HTTPS site URL.",
                null,
                null);
        }

        if (IsLoopbackRedirectUrl(redirectUrl))
        {
            return (false,
                "Flutterwave cannot redirect to localhost. Open the app from your LAN address (e.g. http://192.168.1.40:4200) or set Flutterwave:LocalNetworkAppUrl in development settings.",
                null,
                null);
        }

        string? lastError = null;
        foreach (var paymentMethodType in FlutterwaveOrchestratorPaymentMethods.Resolve(options.Value, currency))
        {
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
                            name = FlutterwaveCustomerNameHelper.Build(user),
                        },
                        payment_method = BuildOrchestratorPaymentMethod(paymentMethodType),
                    },
                    traceId,
                    $"mi-orc-{reference}-{paymentMethodType}",
                    cancellationToken);

                var root = response.RootElement;
                if (!string.Equals(root.GetProperty("status").GetString(), "success", StringComparison.OrdinalIgnoreCase))
                {
                    lastError = TryReadErrorMessage(root) ?? "Could not start Flutterwave payment.";
                    logger.LogWarning(
                        "Flutterwave orchestrator {Method} failed for reference {Reference}: {Error}",
                        paymentMethodType,
                        reference,
                        lastError);
                    continue;
                }

                var data = root.GetProperty("data");
                var externalId = data.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
                var checkoutUrl = TryReadCheckoutUrl(data);
                if (string.IsNullOrWhiteSpace(checkoutUrl))
                {
                    lastError = "Flutterwave did not return a checkout URL.";
                    continue;
                }

                logger.LogInformation(
                    "Flutterwave orchestrator checkout started via {Method} for reference {Reference}.",
                    paymentMethodType,
                    reference);

                return (true, null, checkoutUrl, externalId);
            }
            catch (FlutterwaveApiException ex)
            {
                lastError = ex.Message;
                logger.LogWarning(
                    ex,
                    "Flutterwave orchestrator {Method} failed for reference {Reference}.",
                    paymentMethodType,
                    reference);
            }
        }

        return (false, lastError ?? "Could not start Flutterwave payment.", null, null);
    }

    private async Task<string?> FindSuccessfulChargeIdAsync(
        string reference,
        decimal expectedAmount,
        string expectedCurrency,
        CancellationToken cancellationToken)
    {
        if (options.Value.HasStandardHostedCheckout)
        {
            var v3Id = await FindSuccessfulV3TransactionIdAsync(
                reference,
                expectedAmount,
                expectedCurrency,
                cancellationToken);
            if (!string.IsNullOrWhiteSpace(v3Id))
                return v3Id;
        }

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

    private async Task<string?> FindSuccessfulV3TransactionIdAsync(
        string reference,
        decimal expectedAmount,
        string expectedCurrency,
        CancellationToken cancellationToken)
    {
        try
        {
            using var response = await standardApiClient.GetAsync(
                $"/v3/transactions/verify_by_reference?tx_ref={Uri.EscapeDataString(reference)}",
                cancellationToken);

            var root = response.RootElement;
            if (!string.Equals(root.GetProperty("status").GetString(), "success", StringComparison.OrdinalIgnoreCase))
                return null;

            var data = root.GetProperty("data");
            var status = data.TryGetProperty("status", out var statusEl) ? statusEl.GetString() : null;
            var amount = data.TryGetProperty("amount", out var amountEl) ? amountEl.GetDecimal() : 0m;
            var currency = data.TryGetProperty("currency", out var currencyEl) ? currencyEl.GetString() : null;

            if (!IsSuccessfulStatus(status))
                return null;

            if (!VerifyAmount(expectedAmount, amount))
                return null;

            if (!string.Equals(expectedCurrency, currency, StringComparison.OrdinalIgnoreCase))
                return null;

            return TryReadJsonId(data, "id");
        }
        catch (FlutterwaveApiException ex)
        {
            logger.LogWarning(ex, "Flutterwave v3 transaction lookup failed for reference {Reference}.", reference);
            return null;
        }
    }

    private async Task<bool> VerifyChargeAsync(
        string chargeId,
        decimal expectedAmount,
        string expectedCurrency,
        CancellationToken cancellationToken)
    {
        if (IsV3TransactionId(chargeId))
            return await VerifyV3TransactionAsync(chargeId, expectedAmount, expectedCurrency, cancellationToken);

        return await VerifyV4ChargeAsync(chargeId, expectedAmount, expectedCurrency, cancellationToken);
    }

    private async Task<bool> VerifyV3TransactionAsync(
        string transactionId,
        decimal expectedAmount,
        string expectedCurrency,
        CancellationToken cancellationToken)
    {
        try
        {
            using var response = await standardApiClient.GetAsync(
                $"/v3/transactions/{Uri.EscapeDataString(transactionId)}/verify",
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
            logger.LogWarning(ex, "Flutterwave v3 transaction verification failed for {TransactionId}.", transactionId);
            return false;
        }
    }

    private async Task<bool> VerifyV4ChargeAsync(
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

    private static bool IsV3TransactionId(string chargeId) =>
        chargeId.All(char.IsDigit);

    private static string? TryReadJsonId(JsonElement data, string propertyName)
    {
        if (!data.TryGetProperty(propertyName, out var idEl))
            return null;

        return idEl.ValueKind switch
        {
            JsonValueKind.String => idEl.GetString(),
            JsonValueKind.Number => idEl.GetInt64().ToString(),
            _ => null,
        };
    }

    private static bool IsSuccessfulStatus(string? status) =>
        string.Equals(status, "successful", StringComparison.OrdinalIgnoreCase)
        || string.Equals(status, "succeeded", StringComparison.OrdinalIgnoreCase)
        || string.Equals(status, "completed", StringComparison.OrdinalIgnoreCase);

    private static bool VerifyAmount(decimal expected, decimal actual) =>
        Math.Abs(expected - actual) < 0.01m;

    private string ResolvePaymentRedirectUrl(string reference, string? clientOrigin = null)
    {
        var baseUrl = ResolveClientAppBaseUrl(clientOrigin);
        return $"{baseUrl}/dashboard?payment=flutterwave&reference={Uri.EscapeDataString(reference)}";
    }

    /// <summary>
    /// Flutterwave orchestrator rejects loopback hosts (localhost / 127.0.0.1) but accepts LAN IPs.
    /// Checkout sessions may still use the browser origin; orchestrator fallback needs a substitute.
    /// </summary>
    private string ResolveOrchestratorRedirectUrl(string reference, string? clientOrigin)
    {
        var url = ResolvePaymentRedirectUrl(reference, clientOrigin);
        if (!IsLoopbackRedirectUrl(url))
            return url;

        var alternateBase = TryResolveNonLoopbackAppBaseUrl();
        if (alternateBase is null)
            return url;

        logger.LogInformation(
            "Using {AlternateBase} instead of loopback for Flutterwave orchestrator redirect.",
            alternateBase);

        return $"{alternateBase}/dashboard?payment=flutterwave&reference={Uri.EscapeDataString(reference)}";
    }

    private string ResolveClientAppBaseUrl(string? clientOrigin)
    {
        var fromRequest = TryNormalizeAllowedOrigin(clientOrigin);
        if (!string.IsNullOrWhiteSpace(fromRequest))
            return fromRequest;

        return options.Value.ClientAppUrl.TrimEnd('/');
    }

    private string? TryNormalizeAllowedOrigin(string? origin)
    {
        if (string.IsNullOrWhiteSpace(origin))
            return null;

        if (!Uri.TryCreate(origin.Trim(), UriKind.Absolute, out var uri))
            return null;

        var normalized = $"{uri.Scheme}://{uri.Authority}";
        var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var configured in configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
        {
            if (!string.IsNullOrWhiteSpace(configured))
                allowed.Add(configured.TrimEnd('/'));
        }

        var clientAppUrl = configuration["Flutterwave:ClientAppUrl"] ?? configuration["Stripe:ClientAppUrl"];
        if (!string.IsNullOrWhiteSpace(clientAppUrl))
            allowed.Add(clientAppUrl.TrimEnd('/'));

        return allowed.Contains(normalized) ? normalized : null;
    }

    private string? TryResolveNonLoopbackAppBaseUrl()
    {
        var candidates = new List<string>();

        if (!string.IsNullOrWhiteSpace(options.Value.LocalNetworkAppUrl))
            candidates.Add(options.Value.LocalNetworkAppUrl.TrimEnd('/'));

        var stripeUrl = configuration["Stripe:ClientAppUrl"];
        if (!string.IsNullOrWhiteSpace(stripeUrl))
            candidates.Add(stripeUrl.TrimEnd('/'));

        foreach (var configured in configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
        {
            if (!string.IsNullOrWhiteSpace(configured))
                candidates.Add(configured.TrimEnd('/'));
        }

        if (!string.IsNullOrWhiteSpace(options.Value.PaymentRedirectUrl))
            candidates.Add(options.Value.PaymentRedirectUrl.TrimEnd('/'));

        foreach (var candidate in candidates)
        {
            if (!Uri.TryCreate(candidate, UriKind.Absolute, out var uri))
                continue;

            if (uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
                || uri.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase))
                continue;

            return candidate;
        }

        return null;
    }

    private static bool IsLoopbackRedirectUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
            return false;

        return uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
            || uri.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// v4 checkout URL from API response only — never constructed manually.
    /// </summary>
    private static string? TryReadCheckoutUrl(JsonElement data)
    {
        if (data.TryGetProperty("checkout_session", out var sessionEl))
            data = sessionEl;

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

        if (data.TryGetProperty("next_action", out var nextActionEl))
        {
            if (nextActionEl.TryGetProperty("redirect_url", out var redirectUrlEl))
            {
                if (redirectUrlEl.ValueKind == JsonValueKind.String)
                {
                    var direct = redirectUrlEl.GetString();
                    if (!string.IsNullOrWhiteSpace(direct))
                        return direct;
                }

                if (redirectUrlEl.TryGetProperty("url", out var urlEl))
                {
                    var url = urlEl.GetString();
                    if (!string.IsNullOrWhiteSpace(url))
                        return url;
                }
            }
        }

        return null;
    }

    private static object BuildOrchestratorPaymentMethod(string paymentMethodType) =>
        paymentMethodType switch
        {
            "applepay" => new { type = paymentMethodType, applepay = new { } },
            "googlepay" => new { type = paymentMethodType, googlepay = new { } },
            _ => new { type = paymentMethodType },
        };

    private static string? TryReadErrorMessage(JsonElement root)
    {
        if (root.TryGetProperty("error", out var error))
        {
            if (error.TryGetProperty("message", out var message))
            {
                var text = message.GetString();
                if (error.TryGetProperty("validation_errors", out var validationErrors)
                    && validationErrors.ValueKind == JsonValueKind.Array)
                {
                    var details = validationErrors.EnumerateArray()
                        .Select(item =>
                        {
                            var field = item.TryGetProperty("field_name", out var fieldEl)
                                ? fieldEl.GetString()
                                : null;
                            var detail = item.TryGetProperty("message", out var detailEl)
                                ? detailEl.GetString()
                                : null;
                            return !string.IsNullOrWhiteSpace(field) && !string.IsNullOrWhiteSpace(detail)
                                ? $"{field}: {detail}"
                                : detail;
                        })
                        .Where(d => !string.IsNullOrWhiteSpace(d))
                        .ToList();

                    if (details.Count > 0)
                        return $"{text} ({string.Join("; ", details)})";
                }

                return text;
            }
        }

        if (root.TryGetProperty("message", out var topMessage))
            return topMessage.GetString();
        return null;
    }
}

public static class FlutterwaveOrchestratorPaymentMethods
{
    /// <summary>Opens Flutterwave's hosted checkout (card entry page) without encrypted card fields.</summary>
    public const string DefaultHostedMethod = "applepay";

    private static readonly string[] DefaultHostedMethods = [DefaultHostedMethod, "googlepay"];

    public static IReadOnlyList<string> Resolve(FlutterwaveOptions options, string currency)
    {
        var configured = options.OrchestratorPaymentMethod?.Trim();
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(m => !string.IsNullOrWhiteSpace(m))
                .ToArray();
        }

        _ = currency;
        return DefaultHostedMethods;
    }
}

public static class FlutterwaveReferenceHelper
{
    public static string Create() => $"MK{Guid.NewGuid():N}";
}

/// <summary>Flutterwave v4 requires first/last names 2–50 chars; letters and limited punctuation only.</summary>
public static class FlutterwaveCustomerNameHelper
{
    public static object Build(AppUser user)
    {
        var (first, last) = Resolve(user.FirstName, user.LastName);
        return new { first, last };
    }

    public static (string First, string Last) Resolve(string? firstName, string? lastName)
    {
        var first = NormalizePart(firstName, "Student");
        var last = NormalizePart(lastName, "User");
        first = EnsureMinLength(first, "Student");
        last = EnsureMinLength(last, "User");
        return (first, last);
    }

    private static string NormalizePart(string? value, string fallback)
    {
        if (string.IsNullOrWhiteSpace(value))
            return fallback;

        var cleaned = new string(value.Trim()
            .Where(c => char.IsLetter(c) || c is ' ' or ',' or '.' or '\'' or '-')
            .ToArray()).Trim();

        if (string.IsNullOrWhiteSpace(cleaned))
            return fallback;

        return cleaned.Length > 50 ? cleaned[..50].Trim() : cleaned;
    }

    private static string EnsureMinLength(string value, string fallback)
    {
        if (value.Length >= 2)
            return value;

        if (value.Length == 1)
            return $"{value}.";

        return fallback;
    }
}
