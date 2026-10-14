using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Data;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;
using MishkatulIlm_Server.Options;
using Stripe;
using Stripe.Checkout;

namespace MishkatulIlm_Server.Services;

public sealed class StripeStatementPaymentService(
    AppDbContext db,
    StudentPaymentService paymentService,
    AdminPaymentSubmissionService adminPayments,
    IOptions<StripeOptions> stripeOptions,
    ILogger<StripeStatementPaymentService> logger)
{
    public async Task<(bool Success, string? Error, string? CheckoutUrl, PaymentSubmission? Submission)> CreateCheckoutAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var options = stripeOptions.Value;
        if (!options.CanCreateStatementCheckout)
            return (false, "Online payments are not configured yet.", null, null);

        StripeConfiguration.ApiKey = options.SecretKey;
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);
        if (user is null)
            return (false, "Account not found.", null, null);
        if (user.ApplicationStatus != ApplicationStatusCodes.Active)
            return (false, "Payments are available after you accept your lesson schedule.", null, null);

        var statement = await paymentService.GetStatementAsync(userId, cancellationToken);
        if (statement is null)
            return (false, "Payment submission is not available right now.", null, null);
        if (!IsValidStatementAmount(statement.TotalAmount, statement.Currency))
            return (false, "The payment amount or currency is invalid.", null, null);
        if (statement.Lessons.Count == 0
            || statement.Lessons.Any(lesson => decimal.Round(lesson.Amount, 2) != lesson.Amount)
            || statement.Lessons.Sum(lesson => lesson.Amount) != statement.TotalAmount)
            return (false, "The payment statement is invalid.", null, null);

        var utcNow = DateTime.UtcNow;
        var existing = await db.PaymentSubmissions
            .Where(s => s.StudentUserId == userId && s.BillingYear == statement.BillingYear && s.BillingMonth == statement.BillingMonth)
            .OrderByDescending(s => s.SubmittedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (existing?.Status == PaymentSubmissionStatusCodes.Paid)
            return (false, "This billing period is already marked as paid.", null, null);

        if (existing?.Status == PaymentSubmissionStatusCodes.PendingVerification
            && !string.IsNullOrWhiteSpace(existing.StripeCheckoutSessionId))
        {
            try
            {
                var prior = await new SessionService().GetAsync(existing.StripeCheckoutSessionId, cancellationToken: cancellationToken);
                if (string.Equals(prior.Status, "open", StringComparison.OrdinalIgnoreCase)
                    && !string.IsNullOrWhiteSpace(prior.Url))
                    return (true, null, prior.Url, existing);
            }
            catch (StripeException ex)
            {
                logger.LogInformation(ex, "Could not resume Stripe checkout for submission {SubmissionId}.", existing.Id);
            }
        }

        var submission = existing ?? new PaymentSubmission
        {
            Id = Guid.NewGuid(),
            StudentUserId = userId,
            BillingYear = statement.BillingYear,
            BillingMonth = statement.BillingMonth,
        };
        submission.Status = PaymentSubmissionStatusCodes.PendingVerification;
        submission.Amount = statement.TotalAmount;
        submission.Currency = statement.Currency.ToUpperInvariant();
        submission.SubmittedAtUtc = utcNow;
        submission.ReviewedAtUtc = null;
        submission.ReviewedByAdminUserId = null;
        submission.AdminNote = null;
        submission.PaymentReference = $"stmt_{submission.Id:N}_{utcNow.Ticks}";
        submission.StripeCheckoutSessionId = null;
        submission.StripePaymentIntentId = null;

        var origin = ResolveClientOrigin(options.ClientAppUrl);
        var sessionOptions = BuildSessionOptions(userId, user.Email, submission, statement, origin);

        try
        {
            var session = await new SessionService().CreateAsync(
                sessionOptions,
                new RequestOptions { IdempotencyKey = $"lesson-statement-{submission.PaymentReference}" },
                cancellationToken);
            if (string.IsNullOrWhiteSpace(session.Url))
                return (false, "Could not open the payment page. Please try again.", null, null);

            submission.StripeCheckoutSessionId = session.Id;
            if (existing is null)
                db.PaymentSubmissions.Add(submission);
            await db.SaveChangesAsync(cancellationToken);
            return (true, null, session.Url, submission);
        }
        catch (StripeException ex)
        {
            logger.LogWarning(ex, "Stripe Checkout creation failed for submission {SubmissionId}.", submission.Id);
            return (false, "Could not start payment. Please try again.", null, null);
        }
    }

    public async Task<bool> TryRecordPaidSessionAsync(Session session, CancellationToken cancellationToken = default)
    {
        if (!string.Equals(session.Mode, "payment", StringComparison.OrdinalIgnoreCase)
            || !string.Equals(session.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase))
            return false;

        var metadata = session.Metadata;
        if (metadata is null
            || !metadata.TryGetValue("submission_id", out var submissionIdText)
            || !Guid.TryParse(submissionIdText, out var submissionId)
            || !metadata.TryGetValue("amount_minor", out var amountText)
            || !long.TryParse(amountText, out var expectedMinor)
            || !metadata.TryGetValue("currency", out var expectedCurrency)
            || !metadata.TryGetValue("payment_reference", out var reference))
            return false;

        if (!IsValidStatementAmount(expectedMinor / 100m, expectedCurrency)
            || session.AmountTotal != expectedMinor
            || !string.Equals(session.Currency, expectedCurrency, StringComparison.OrdinalIgnoreCase))
        {
            logger.LogWarning("Stripe checkout amount or currency mismatch for session {SessionId}.", session.Id);
            return false;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var submission = await db.PaymentSubmissions.Include(s => s.Student)
            .FirstOrDefaultAsync(s => s.Id == submissionId, cancellationToken);
        if (submission is not null && IsAlreadyPaid(submission))
        {
            await transaction.CommitAsync(cancellationToken);
            return true;
        }
        if (submission is null
            || submission.Status != PaymentSubmissionStatusCodes.PendingVerification
            || submission.StripeCheckoutSessionId != session.Id
            || submission.PaymentReference != reference
            || submission.Amount != expectedMinor / 100m
            || !string.Equals(submission.Currency, expectedCurrency, StringComparison.OrdinalIgnoreCase)
            || submission.Student is null
            || submission.Student.IsAdmin
            || !string.Equals(submission.Student.Id.ToString(), metadata.GetValueOrDefault("user_id"), StringComparison.OrdinalIgnoreCase))
            return false;

        submission.StripePaymentIntentId = session.PaymentIntentId;
        var (success, _, _) = await adminPayments.ApproveAutomaticallyAsync(submission.Id, cancellationToken);
        if (success)
            await transaction.CommitAsync(cancellationToken);
        return success;
    }

    public async Task<(bool Success, string Message)> ConfirmReturnAsync(
        Guid userId,
        string sessionId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(sessionId) || sessionId.Length > 255)
            return (false, "Payment session is invalid.");
        if (!stripeOptions.Value.CanCreateStatementCheckout)
            return (false, "Online payments are not configured yet.");

        StripeConfiguration.ApiKey = stripeOptions.Value.SecretKey;
        try
        {
            var session = await new SessionService().GetAsync(sessionId, cancellationToken: cancellationToken);
            if (session.Metadata is null
                || !session.Metadata.TryGetValue("user_id", out var owner)
                || !string.Equals(owner, userId.ToString(), StringComparison.OrdinalIgnoreCase))
                return (false, "Payment session not found.");

            if (!await TryRecordPaidSessionAsync(session, cancellationToken))
                return string.Equals(session.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase)
                    ? (false, "We are confirming your payment. Refresh this page in a moment.")
                    : (false, "Payment was not completed. You can try again when ready.");

            return (true, "Payment received. Thank you!");
        }
        catch (StripeException ex)
        {
            logger.LogWarning(ex, "Stripe return confirmation failed for session {SessionId}.", sessionId);
            return (false, "We could not confirm your payment yet. Refresh this page in a moment.");
        }
    }

    public static bool IsValidStatementAmount(decimal amount, string? currency) =>
        amount > 0
        && decimal.Round(amount, 2) == amount
        && string.Equals(currency, "USD", StringComparison.OrdinalIgnoreCase);

    public static bool IsAlreadyPaid(PaymentSubmission submission) =>
        submission.Status == PaymentSubmissionStatusCodes.Paid;

    public static long ToMinorUnits(decimal amount) => checked((long)(amount * 100m));

    public static SessionCreateOptions BuildSessionOptions(
        Guid userId,
        string email,
        PaymentSubmission submission,
        PaymentStatementDto statement,
        string trustedOrigin)
    {
        var lineItems = statement.Lessons.Select((lesson, index) => new SessionLineItemOptions
        {
            Quantity = 1,
            PriceData = new SessionLineItemPriceDataOptions
            {
                Currency = "usd",
                UnitAmount = ToMinorUnits(lesson.Amount),
                ProductData = new SessionLineItemPriceDataProductDataOptions
                {
                    Name = $"Lesson {index + 1} ({lesson.DurationMinutes} minutes)",
                    Description = $"{lesson.RateLabel} · {lesson.StartsAtUtc:MMM d, yyyy}",
                },
            },
        }).ToList();

        return new SessionCreateOptions
        {
            Mode = "payment",
            CustomerEmail = email,
            ClientReferenceId = userId.ToString(),
            SuccessUrl = $"{trustedOrigin}/dashboard?payment=stripe-success&session_id={{CHECKOUT_SESSION_ID}}",
            CancelUrl = $"{trustedOrigin}/dashboard?payment=stripe-cancelled",
            LineItems = lineItems,
            Metadata = new Dictionary<string, string>
            {
                ["user_id"] = userId.ToString(),
                ["submission_id"] = submission.Id.ToString(),
                ["payment_reference"] = submission.PaymentReference,
                ["amount_minor"] = ToMinorUnits(statement.TotalAmount).ToString(System.Globalization.CultureInfo.InvariantCulture),
                ["currency"] = "USD",
                ["billing_year"] = statement.BillingYear.ToString(System.Globalization.CultureInfo.InvariantCulture),
                ["billing_month"] = statement.BillingMonth.ToString(System.Globalization.CultureInfo.InvariantCulture),
            },
            PaymentIntentData = new SessionPaymentIntentDataOptions
            {
                Metadata = new Dictionary<string, string>
                {
                    ["submission_id"] = submission.Id.ToString(),
                    ["payment_reference"] = submission.PaymentReference,
                },
            },
        };
    }

    private static string ResolveClientOrigin(string? configuredUrl)
    {
        if (!Uri.TryCreate(configuredUrl, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp)
            || !string.IsNullOrEmpty(uri.UserInfo)
            || !string.IsNullOrEmpty(uri.Query)
            || !string.IsNullOrEmpty(uri.Fragment))
            throw new InvalidOperationException("Stripe:ClientAppUrl must be a trusted absolute HTTP(S) origin.");

        return uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
    }
}
