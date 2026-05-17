using Stripe;

namespace MishkatulIlm_Server.Services;

internal static class StripeBillingHelpers
{
    public static DateTime? GetCurrentPeriodEnd(Subscription subscription)
    {
        var items = subscription.Items?.Data;
        if (items is null || items.Count == 0)
            return null;

        return items.Max(i => i.CurrentPeriodEnd);
    }

    public static string? GetSubscriptionId(Invoice invoice)
    {
        var subscription = invoice.Parent?.SubscriptionDetails?.Subscription;
        if (subscription is null)
            return null;

        return subscription is Subscription sub ? sub.Id : subscription.ToString();
    }
}
