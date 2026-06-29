using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;

namespace MishkatulIlm_Server.Services;

public static class StudentPaymentSummaryBuilder
{
    public static StudentPaymentSummaryDto Build(
        AppUser user,
        PaymentSubmission? currentSubmission,
        DateTime utcNow,
        BillingResolution? billing = null)
    {
        var (billingYear, billingMonth) = billing is null
            ? LessonBillingService.ResolveBillingMonth(user, utcNow)
            : (billing.BillingYear, billing.BillingMonth);
        var dueUtc = LessonBillingService.ResolvePaymentDueUtc(user, billingYear, billingMonth, utcNow);
        var daysUntilDue = dueUtc is null ? (int?)null : (dueUtc.Value.Date - utcNow.Date).Days;

        var hasPaid = user.LastPaymentAtUtc is not null;
        var currentStatus = currentSubmission?.Status;
        var currentPeriodPaid = currentStatus == PaymentSubmissionStatusCodes.Paid;
        var pendingVerification = currentStatus == PaymentSubmissionStatusCodes.PendingVerification;

        var paymentOverdue = hasPaid
            && !currentPeriodPaid
            && !pendingVerification
            && dueUtc is not null
            && dueUtc.Value.Date < utcNow.Date;

        var requiresInitialPayment = !hasPaid;
        var paymentWindowOpen = requiresInitialPayment
            || paymentOverdue
            || (daysUntilDue is >= 0 and <= 5);

        var showReminder = paymentWindowOpen
            && hasPaid
            && !requiresInitialPayment
            && daysUntilDue is >= 0 and <= 5
            && !currentPeriodPaid
            && !pendingVerification;

        var showPaymentDetails = paymentWindowOpen || pendingVerification;

        var canSubmitPayment = showPaymentDetails
            && !currentPeriodPaid
            && !pendingVerification
            && paymentWindowOpen;

        return new StudentPaymentSummaryDto
        {
            NextPaymentDueUtc = dueUtc,
            LastPaymentAmount = user.LastPaymentAmount,
            LastPaymentCurrency = string.IsNullOrWhiteSpace(user.LastPaymentCurrency)
                ? LessonBillingService.DefaultCurrency
                : user.LastPaymentCurrency,
            LastPaymentAtUtc = user.LastPaymentAtUtc,
            RequiresInitialPayment = requiresInitialPayment,
            PaymentOverdue = paymentOverdue || (requiresInitialPayment && dueUtc is not null && dueUtc.Value.Date < utcNow.Date),
            ShowPaymentReminder = showReminder,
            DaysUntilDue = daysUntilDue,
            CurrentSubmissionStatus = currentStatus,
            CanSubmitPayment = canSubmitPayment,
            CurrentPeriodPaid = currentPeriodPaid,
            ShowPaymentDetails = showPaymentDetails,
            AwaitingNextBlockPayment = billing?.IsRolloverBlock == true
                && !currentPeriodPaid
                && !pendingVerification
                && paymentWindowOpen,
        };
    }
}
