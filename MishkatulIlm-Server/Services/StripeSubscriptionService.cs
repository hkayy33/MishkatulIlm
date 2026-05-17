using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Options;
using Stripe;

namespace MishkatulIlm_Server.Services;

public sealed class StripeSubscriptionService(
    AppDbContext db,
    IOptions<StripeOptions> stripeOptions,
    StripePaymentRecorder paymentRecorder,
    StripeSubscriptionSyncService subscriptionSync,
    ILogger<StripeSubscriptionService> logger)
{
    public async Task<(bool Success, string? Error, DateTime? PeriodEndUtc)> CancelAtPeriodEndAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        var options = stripeOptions.Value;
        if (!options.IsConfigured)
            return (false, "Online payments are not configured yet.", null);

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);
        if (user is null)
            return (false, "Account not found.", null);

        await subscriptionSync.TrySyncUserFromStripeAsync(user, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        if (string.IsNullOrWhiteSpace(user.StripeSubscriptionId))
            return (false, "You do not have an active monthly subscription.", null);

        if (!StripeSubscriptionStatusCodes.IsBillable(user.StripeSubscriptionStatus)
            && !StripeSubscriptionStatusCodes.IsPastDue(user.StripeSubscriptionStatus))
            return (false, "Your subscription is not active.", null);

        if (user.StripeSubscriptionCancelAtPeriodEnd)
            return (false, "Your subscription is already scheduled to cancel.", null);

        StripeConfiguration.ApiKey = options.SecretKey;
        try
        {
            var updated = await new SubscriptionService().UpdateAsync(
                user.StripeSubscriptionId,
                new SubscriptionUpdateOptions { CancelAtPeriodEnd = true },
                cancellationToken: cancellationToken);

            await paymentRecorder.TrySyncSubscriptionAsync(updated, cancellationToken);
            logger.LogInformation("User {UserId} scheduled subscription {SubscriptionId} to cancel at period end.", userId, updated.Id);
            return (true, null, StripeBillingHelpers.GetCurrentPeriodEnd(updated));
        }
        catch (StripeException ex)
        {
            logger.LogError(ex, "Stripe cancel-at-period-end failed for user {UserId}.", userId);
            return (false, "Could not cancel your subscription. Please try again or contact support.", null);
        }
    }
}
