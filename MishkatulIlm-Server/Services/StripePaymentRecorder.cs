using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;
using Stripe;
using Stripe.Checkout;

namespace MishkatulIlm_Server.Services;

public sealed class StripePaymentRecorder(AppDbContext db, ILogger<StripePaymentRecorder> logger)
{
    public async Task<bool> TryRecordCheckoutSessionAsync(Session session, CancellationToken cancellationToken)
    {
        if (!IsSessionPaid(session))
            return false;

        var user = await ResolveUserAsync(session.Metadata, session.ClientReferenceId, cancellationToken);
        if (user is null)
        {
            logger.LogWarning("Checkout session {SessionId} references unknown user.", session.Id);
            return false;
        }

        LinkStripeIdsFromSession(user, session);

        if (!string.IsNullOrWhiteSpace(session.SubscriptionId))
            await SyncSubscriptionAsync(user, session.SubscriptionId, cancellationToken);

        if (user.LastPaymentAtUtc is not null)
        {
            await db.SaveChangesAsync(cancellationToken);
            return true;
        }

        ApplyPayment(
            user,
            DateTime.UtcNow,
            session.AmountTotal.HasValue ? session.AmountTotal.Value / 100m : null,
            session.Currency);

        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Recorded initial payment for user {UserId} from session {SessionId}.", user.Id, session.Id);
        return true;
    }

    public async Task<bool> TryRecordInvoicePaidAsync(Invoice invoice, CancellationToken cancellationToken)
    {
        if (!string.Equals(invoice.Status, "paid", StringComparison.OrdinalIgnoreCase))
            return false;

        var subscriptionId = StripeBillingHelpers.GetSubscriptionId(invoice);
        if (string.IsNullOrWhiteSpace(subscriptionId))
            return false;

        var user = await ResolveUserByStripeIdsAsync(
            invoice.CustomerId,
            subscriptionId,
            cancellationToken);

        if (user is null)
        {
            logger.LogWarning(
                "Invoice {InvoiceId} could not be matched to a student (customer {CustomerId}).",
                invoice.Id,
                invoice.CustomerId);
            return false;
        }

        if (string.Equals(user.LastStripeInvoiceId, invoice.Id, StringComparison.Ordinal))
            return true;

        var paidAt = invoice.StatusTransitions?.PaidAt ?? DateTime.UtcNow;
        ApplyPayment(
            user,
            paidAt,
            invoice.AmountPaid / 100m,
            invoice.Currency);

        user.LastStripeInvoiceId = invoice.Id;
        LinkStripeIds(user, invoice.CustomerId, subscriptionId);
        await SyncSubscriptionAsync(user, subscriptionId, cancellationToken);

        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Recorded subscription payment for user {UserId} from invoice {InvoiceId}.", user.Id, invoice.Id);
        return true;
    }

    public async Task<bool> TrySyncSubscriptionAsync(Subscription subscription, CancellationToken cancellationToken)
    {
        var user = await ResolveUserByStripeIdsAsync(
            subscription.CustomerId,
            subscription.Id,
            cancellationToken);

        if (user is null)
        {
            logger.LogWarning(
                "Subscription {SubscriptionId} could not be matched to a student.",
                subscription.Id);
            return false;
        }

        ApplySubscriptionState(user, subscription);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task SyncSubscriptionAsync(AppUser user, string subscriptionId, CancellationToken cancellationToken)
    {
        var subscription = await new SubscriptionService().GetAsync(subscriptionId, cancellationToken: cancellationToken);
        ApplySubscriptionState(user, subscription);
    }

    public void ApplySubscriptionState(AppUser user, Subscription subscription)
    {
        LinkStripeIds(user, subscription.CustomerId, subscription.Id);
        user.StripeSubscriptionStatus = subscription.Status;
        user.StripeSubscriptionCancelAtPeriodEnd = subscription.CancelAtPeriodEnd;
        var periodEnd = StripeBillingHelpers.GetCurrentPeriodEnd(subscription);
        user.StripeSubscriptionPeriodEndUtc = periodEnd;

        if (StripeSubscriptionStatusCodes.IsBillable(subscription.Status) && periodEnd is not null)
            user.NextPaymentDueUtc = periodEnd;
    }

    private static void LinkStripeIdsFromSession(AppUser user, Session session)
    {
        var customerId = session.CustomerId ?? session.Customer?.Id;
        LinkStripeIds(user, customerId, session.SubscriptionId);
    }

    private static void LinkStripeIds(AppUser user, string? customerId, string? subscriptionId)
    {
        if (!string.IsNullOrWhiteSpace(customerId))
            user.StripeCustomerId = customerId;
        if (!string.IsNullOrWhiteSpace(subscriptionId))
            user.StripeSubscriptionId = subscriptionId;
    }

    private void ApplyPayment(AppUser user, DateTime paidAt, decimal? amount, string? currency)
    {
        user.LastPaymentAtUtc = paidAt;
        if (amount.HasValue)
            user.LastPaymentAmount = amount.Value;
        if (!string.IsNullOrWhiteSpace(currency))
            user.LastPaymentCurrency = currency.ToUpperInvariant();

        if (user.NextPaymentDueUtc is null || user.NextPaymentDueUtc <= paidAt)
            user.NextPaymentDueUtc = LessonBillingService.NextPaymentDueAfterPaid(paidAt);
    }

    private async Task<AppUser?> ResolveUserAsync(
        IDictionary<string, string>? metadata,
        string? clientReferenceId,
        CancellationToken cancellationToken)
    {
        var userIdRaw = metadata is not null && metadata.TryGetValue("user_id", out var fromMeta)
            ? fromMeta
            : clientReferenceId;

        if (string.IsNullOrWhiteSpace(userIdRaw) || !Guid.TryParse(userIdRaw, out var userId))
            return null;

        return await db.Users.FirstOrDefaultAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);
    }

    private async Task<AppUser?> ResolveUserByStripeIdsAsync(
        string? customerId,
        string? subscriptionId,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(subscriptionId))
        {
            var bySubscription = await db.Users.FirstOrDefaultAsync(
                u => u.StripeSubscriptionId == subscriptionId && !u.IsAdmin,
                cancellationToken);
            if (bySubscription is not null)
                return bySubscription;
        }

        if (!string.IsNullOrWhiteSpace(customerId))
        {
            return await db.Users.FirstOrDefaultAsync(
                u => u.StripeCustomerId == customerId && !u.IsAdmin,
                cancellationToken);
        }

        return null;
    }

    private static bool IsSessionPaid(Session session) =>
        string.Equals(session.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase)
        || string.Equals(session.Status, "complete", StringComparison.OrdinalIgnoreCase);
}
