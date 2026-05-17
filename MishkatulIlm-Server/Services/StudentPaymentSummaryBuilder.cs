using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;

namespace MishkatulIlm_Server.Services;

public static class StudentPaymentSummaryBuilder
{
    public static StudentPaymentSummaryDto Build(AppUser user)
    {
        var hasPaid = user.LastPaymentAtUtc is not null;
        var hasActiveSubscription = StripeSubscriptionStatusCodes.IsBillable(user.StripeSubscriptionStatus);
        var subscriptionPastDue = StripeSubscriptionStatusCodes.IsPastDue(user.StripeSubscriptionStatus);

        var paymentOverdue = hasPaid
            && !hasActiveSubscription
            && user.NextPaymentDueUtc is not null
            && user.NextPaymentDueUtc.Value.Date < DateTime.UtcNow.Date;

        var requiresInitialPayment = !hasPaid;
        var canMakePayment = requiresInitialPayment
            || ((paymentOverdue || subscriptionPastDue) && !hasActiveSubscription);

        var hasManageableSubscription = !string.IsNullOrWhiteSpace(user.StripeSubscriptionId)
            && (hasActiveSubscription || subscriptionPastDue);

        var canCancelSubscription = hasManageableSubscription && !user.StripeSubscriptionCancelAtPeriodEnd;

        return new StudentPaymentSummaryDto
        {
            NextPaymentDueUtc = hasPaid ? user.NextPaymentDueUtc : null,
            LastPaymentAmount = user.LastPaymentAmount,
            LastPaymentCurrency = user.LastPaymentCurrency,
            LastPaymentAtUtc = user.LastPaymentAtUtc,
            RequiresInitialPayment = requiresInitialPayment,
            PaymentOverdue = paymentOverdue,
            HasActiveSubscription = hasActiveSubscription,
            SubscriptionCancelAtPeriodEnd = user.StripeSubscriptionCancelAtPeriodEnd,
            SubscriptionCurrentPeriodEndUtc = user.StripeSubscriptionPeriodEndUtc,
            SubscriptionPastDue = subscriptionPastDue,
            CanMakePayment = canMakePayment,
            CanCancelSubscription = canCancelSubscription,
        };
    }
}
