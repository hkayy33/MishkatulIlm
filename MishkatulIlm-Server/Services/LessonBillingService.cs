using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;

namespace MishkatulIlm_Server.Services;

public static class LessonBillingService
{
    public const decimal DefaultHourlyRateUsd = 5m;
    public const string DefaultCurrency = "USD";

    public static (DateTime MonthStartUtc, DateTime MonthEndUtc) MonthRangeUtc(int year, int month)
    {
        var monthStart = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        return (monthStart, monthStart.AddMonths(1));
    }

    public static string FormatBillingPeriod(int year, int month) =>
        new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc).ToString("MMMM yyyy");

    public static (int Year, int Month) ResolveBillingMonth(AppUser user, DateTime utcNow)
    {
        if (user.LastPaymentAtUtc is null)
            return (utcNow.Year, utcNow.Month);

        var nextMonthStart = new DateTime(utcNow.Year, utcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1);
        return (nextMonthStart.Year, nextMonthStart.Month);
    }

    public static PaymentStatementDto BuildStatement(
        AppUser user,
        IReadOnlyList<LessonSlot> lessons,
        SchedulingSettings settings,
        int billingYear,
        int billingMonth,
        PaymentSubmission? currentSubmission,
        DateTime utcNow)
    {
        var (monthStart, monthEnd) = MonthRangeUtc(billingYear, billingMonth);
        var hourlyRate = settings.PaymentHourlyRateUsd > 0
            ? settings.PaymentHourlyRateUsd
            : DefaultHourlyRateUsd;

        var billableLessons = lessons
            .Where(l =>
                l.StartsAtUtc >= monthStart
                && l.StartsAtUtc < monthEnd
                && l.AttendanceStatus != AttendanceStatusCodes.NotAttending)
            .OrderBy(l => l.StartsAtUtc)
            .ToList();

        var lineItems = billableLessons
            .Select(l =>
            {
                var minutes = (int)Math.Round((l.EndsAtUtc - l.StartsAtUtc).TotalMinutes);
                if (minutes <= 0)
                    minutes = 60;

                var hours = minutes / 60m;
                var amount = Math.Round(hours * hourlyRate, 2, MidpointRounding.AwayFromZero);
                return new PaymentLessonLineItemDto
                {
                    SlotId = l.Id,
                    StartsAtUtc = l.StartsAtUtc,
                    EndsAtUtc = l.EndsAtUtc,
                    DurationMinutes = minutes,
                    HourlyRate = hourlyRate,
                    Amount = amount,
                };
            })
            .ToList();

        var totalAmount = lineItems.Sum(i => i.Amount);
        var paymentReference = PaymentReferenceHelper.Build(user);
        var dueUtc = ResolvePaymentDueUtc(user, billingYear, billingMonth, utcNow);
        var daysUntilDue = dueUtc is null ? (int?)null : (dueUtc.Value.Date - utcNow.Date).Days;

        return new PaymentStatementDto
        {
            StudentName = $"{user.FirstName} {user.LastName}".Trim(),
            PaymentReference = paymentReference,
            BillingYear = billingYear,
            BillingMonth = billingMonth,
            BillingPeriodLabel = FormatBillingPeriod(billingYear, billingMonth),
            PaymentDueUtc = dueUtc,
            ShowPaymentReminder = daysUntilDue is >= 0 and <= 5,
            DaysUntilDue = daysUntilDue,
            HourlyRate = hourlyRate,
            Currency = DefaultCurrency,
            TotalAmount = totalAmount,
            Lessons = lineItems,
            AccountName = settings.PaymentAccountName,
            AccountNumber = settings.PaymentAccountNumber,
            SortCode = settings.PaymentSortCode,
            BankName = settings.PaymentBankName,
            PaymentInstructions = settings.PaymentInstructions,
            CurrentSubmissionStatus = currentSubmission?.Status,
            CurrentSubmissionId = currentSubmission?.Id,
            CurrentSubmissionSubmittedAtUtc = currentSubmission?.SubmittedAtUtc,
        };
    }

    public static DateTime? ResolvePaymentDueUtc(AppUser user, int billingYear, int billingMonth, DateTime utcNow)
    {
        if (user.LastPaymentAtUtc is null)
            return utcNow.Date;

        if (user.NextPaymentDueUtc is not null)
            return user.NextPaymentDueUtc.Value.Date;

        var (_, monthEnd) = MonthRangeUtc(billingYear, billingMonth);
        return monthEnd.AddDays(-1).Date;
    }
}
