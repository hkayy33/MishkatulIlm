using Microsoft.Extensions.Options;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Options;
using Stripe;

namespace MishkatulIlm_Server.Services;

/// <summary>
/// Links paid students to their Stripe subscription when webhooks or checkout did not persist ids yet.
/// </summary>
public sealed class StripeSubscriptionSyncService(
    StripePaymentRecorder paymentRecorder,
    IOptions<StripeOptions> stripeOptions,
    ILogger<StripeSubscriptionSyncService> logger)
{
    public async Task TrySyncUserFromStripeAsync(AppUser user, CancellationToken cancellationToken)
    {
        if (user.LastPaymentAtUtc is null)
            return;

        var options = stripeOptions.Value;
        if (!options.IsConfigured)
            return;

        if (HasLinkedManageableSubscription(user))
            return;

        StripeConfiguration.ApiKey = options.SecretKey;

        try
        {
            var subscription = await ResolveSubscriptionAsync(user, cancellationToken);
            if (subscription is null)
                return;

            paymentRecorder.ApplySubscriptionState(user, subscription);
            logger.LogInformation(
                "Synced Stripe subscription {SubscriptionId} for user {UserId}.",
                subscription.Id,
                user.Id);
        }
        catch (StripeException ex)
        {
            logger.LogWarning(ex, "Stripe subscription sync failed for user {UserId}.", user.Id);
        }
    }

    private static bool HasLinkedManageableSubscription(AppUser user) =>
        !string.IsNullOrWhiteSpace(user.StripeSubscriptionId)
        && (StripeSubscriptionStatusCodes.IsBillable(user.StripeSubscriptionStatus)
            || StripeSubscriptionStatusCodes.IsPastDue(user.StripeSubscriptionStatus));

    private async Task<Subscription?> ResolveSubscriptionAsync(AppUser user, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(user.StripeSubscriptionId))
        {
            var existing = await TryGetSubscriptionAsync(user.StripeSubscriptionId, cancellationToken);
            if (existing is not null && IsManageableStatus(existing.Status))
                return existing;
        }

        var customerId = user.StripeCustomerId;
        if (string.IsNullOrWhiteSpace(customerId))
            customerId = await FindCustomerIdByEmailAsync(user.Email, cancellationToken);

        if (string.IsNullOrWhiteSpace(customerId))
            return null;

        user.StripeCustomerId = customerId;
        return await FindManageableSubscriptionForCustomerAsync(customerId, cancellationToken);
    }

    private static async Task<Subscription?> TryGetSubscriptionAsync(
        string subscriptionId,
        CancellationToken cancellationToken)
    {
        try
        {
            return await new SubscriptionService().GetAsync(subscriptionId, cancellationToken: cancellationToken);
        }
        catch (StripeException)
        {
            return null;
        }
    }

    private static async Task<string?> FindCustomerIdByEmailAsync(string email, CancellationToken cancellationToken)
    {
        var customers = await new CustomerService().ListAsync(
            new CustomerListOptions
            {
                Email = email.Trim(),
                Limit = 3,
            },
            cancellationToken: cancellationToken);

        return customers.Data.FirstOrDefault()?.Id;
    }

    private static async Task<Subscription?> FindManageableSubscriptionForCustomerAsync(
        string customerId,
        CancellationToken cancellationToken)
    {
        var subscriptions = await new SubscriptionService().ListAsync(
            new SubscriptionListOptions
            {
                Customer = customerId,
                Limit = 20,
            },
            cancellationToken: cancellationToken);

        return subscriptions.Data
            .Where(s => IsManageableStatus(s.Status))
            .OrderByDescending(s => s.Created)
            .FirstOrDefault();
    }

    private static bool IsManageableStatus(string? status) =>
        StripeSubscriptionStatusCodes.IsBillable(status)
        || StripeSubscriptionStatusCodes.IsPastDue(status);
}
