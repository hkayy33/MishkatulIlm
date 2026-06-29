using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;

namespace MishkatulIlm_Server.Services;

public static class LessonBillingService
{
    public const decimal DefaultRate45MinUsd = 5m;
    public const decimal DefaultRate60MinUsd = 7m;
    public const string DefaultCurrency = "USD";

    /// <summary>Legacy alias — prefer <see cref="DefaultRate60MinUsd"/>.</summary>
    public const decimal DefaultHourlyRateUsd = DefaultRate60MinUsd;

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

    public static IReadOnlyList<LessonSlot> SyntheticSlotsFromPlanned(
        IReadOnlyList<PlannedLessonSlotDto> planned) =>
        planned
            .Select(l => new LessonSlot
            {
                Id = Guid.Empty,
                StartsAtUtc = l.StartsAtUtc,
                EndsAtUtc = l.EndsAtUtc,
            })
            .ToList();

    public static string FormatRolloverBillingPeriod(IReadOnlyList<PlannedLessonSlotDto> planned)
    {
        if (planned.Count == 0)
            return string.Empty;

        var ordered = planned.OrderBy(l => l.StartsAtUtc).ToList();
        var first = ordered[0].StartsAtUtc;
        var last = ordered[^1].StartsAtUtc;

        if (first.Year == last.Year && first.Month == last.Month)
            return $"Next 4-week block ({FormatBillingPeriod(first.Year, first.Month)})";

        return $"Next 4-week block ({first:dd MMM} – {last:dd MMM yyyy})";
    }

    public static (decimal Rate45MinUsd, decimal Rate60MinUsd) ResolveRates(SchedulingSettings settings)
    {
        var rate45 = settings.PaymentRate45MinUsd > 0
            ? settings.PaymentRate45MinUsd
            : DefaultRate45MinUsd;
        var rate60 = settings.PaymentRate60MinUsd > 0
            ? settings.PaymentRate60MinUsd
            : DefaultRate60MinUsd;
        return (rate45, rate60);
    }

    public static (decimal Amount, decimal LessonRate, string RateLabel) PriceLesson(
        int durationMinutes,
        decimal rate45MinUsd,
        decimal rate60MinUsd)
    {
        if (durationMinutes <= 0)
            durationMinutes = 60;

        if (durationMinutes <= 52)
            return (rate45MinUsd, rate45MinUsd, "45 min lesson");

        if (durationMinutes <= 75)
            return (rate60MinUsd, rate60MinUsd, "1 hour lesson");

        var amount = Math.Round(rate60MinUsd * durationMinutes / 60m, 2, MidpointRounding.AwayFromZero);
        return (amount, rate60MinUsd, $"{durationMinutes} min lesson");
    }

    public static PaymentStatementDto BuildStatement(
        AppUser user,
        IReadOnlyList<LessonSlot> lessons,
        SchedulingSettings settings,
        int billingYear,
        int billingMonth,
        PaymentSubmission? currentSubmission,
        DateTime utcNow,
        string? billingPeriodLabelOverride = null,
        bool billEntireLessonList = false)
    {
        var (monthStart, monthEnd) = MonthRangeUtc(billingYear, billingMonth);
        var (rate45MinUsd, rate60MinUsd) = ResolveRates(settings);

        var billableLessons = (billEntireLessonList
                ? lessons
                : lessons.Where(l => l.StartsAtUtc >= monthStart && l.StartsAtUtc < monthEnd))
            .Where(l => IsBillableAttendance(l.AttendanceStatus))
            .OrderBy(l => l.StartsAtUtc)
            .ToList();

        var lineItems = billableLessons
            .Select(l =>
            {
                var minutes = (int)Math.Round((l.EndsAtUtc - l.StartsAtUtc).TotalMinutes);
                var (amount, lessonRate, rateLabel) = PriceLesson(minutes, rate45MinUsd, rate60MinUsd);
                return new PaymentLessonLineItemDto
                {
                    SlotId = l.Id,
                    StartsAtUtc = l.StartsAtUtc,
                    EndsAtUtc = l.EndsAtUtc,
                    DurationMinutes = minutes,
                    LessonRate = lessonRate,
                    HourlyRate = lessonRate,
                    RateLabel = rateLabel,
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
            BillingPeriodLabel = string.IsNullOrWhiteSpace(billingPeriodLabelOverride)
                ? FormatBillingPeriod(billingYear, billingMonth)
                : billingPeriodLabelOverride,
            PaymentDueUtc = dueUtc,
            ShowPaymentReminder = daysUntilDue is >= 0 and <= 5,
            DaysUntilDue = daysUntilDue,
            Rate45MinUsd = rate45MinUsd,
            Rate60MinUsd = rate60MinUsd,
            HourlyRate = rate60MinUsd,
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

        return NextPaymentDueAfterPaid(user.LastPaymentAtUtc.Value);
    }

    /// <summary>Next manual payment is due one calendar month after the last payment date.</summary>
    public static DateTime NextPaymentDueAfterPaid(DateTime paidAtUtc) =>
        DateTime.SpecifyKind(paidAtUtc, DateTimeKind.Utc).Date.AddMonths(1);

    /// <summary>Lessons marked not attending are excluded from payment totals and covered-lesson lists.</summary>
    public static bool IsBillableAttendance(string? attendanceStatus)
    {
        if (string.IsNullOrWhiteSpace(attendanceStatus))
            return true;

        return attendanceStatus.Trim().ToUpperInvariant() switch
        {
            AttendanceStatusCodes.NotAttending or "NOT_ATTENDING" or "NOTATTENDING" or "ABSENT" => false,
            _ => true,
        };
    }

    /// <summary>Calendar billing month for the first lesson in a rollover block.</summary>
    public static (int Year, int Month) BillingMonthForLessonStart(DateTime startsAtUtc)
    {
        var utc = DateTime.SpecifyKind(startsAtUtc, DateTimeKind.Utc);
        return (utc.Year, utc.Month);
    }

    public static bool IsBillingPeriodPaid(
        int billingYear,
        int billingMonth,
        IReadOnlySet<(int Year, int Month)> paidPeriods) =>
        paidPeriods.Contains((billingYear, billingMonth));
}
