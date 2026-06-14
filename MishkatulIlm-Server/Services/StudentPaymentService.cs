using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;

namespace MishkatulIlm_Server.Services;

public sealed class StudentPaymentService(AppDbContext db, SchedulingSettingsService schedulingSettings)
{
    public async Task<PaymentStatementDto?> GetStatementAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var user = await db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);
        if (user is null)
            return null;

        var utcNow = DateTime.UtcNow;
        var (billingYear, billingMonth) = LessonBillingService.ResolveBillingMonth(user, utcNow);
        var (monthStart, monthEnd) = LessonBillingService.MonthRangeUtc(billingYear, billingMonth);

        var lessons = await db.LessonSlots.AsNoTracking()
            .Where(s => s.StudentUserId == userId && s.StartsAtUtc >= monthStart && s.StartsAtUtc < monthEnd)
            .OrderBy(s => s.StartsAtUtc)
            .ToListAsync(cancellationToken);

        var currentSubmission = await db.PaymentSubmissions.AsNoTracking()
            .Where(s => s.StudentUserId == userId && s.BillingYear == billingYear && s.BillingMonth == billingMonth)
            .OrderByDescending(s => s.SubmittedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        var summary = StudentPaymentSummaryBuilder.Build(user, currentSubmission, utcNow);
        if (!summary.ShowPaymentDetails)
            return null;

        var settings = await schedulingSettings.GetEntityAsync(cancellationToken);
        return LessonBillingService.BuildStatement(
            user,
            lessons,
            settings,
            billingYear,
            billingMonth,
            currentSubmission,
            utcNow);
    }

    public async Task<PaymentSubmission?> GetCurrentSubmissionAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var user = await db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);
        if (user is null)
            return null;

        var utcNow = DateTime.UtcNow;
        var (billingYear, billingMonth) = LessonBillingService.ResolveBillingMonth(user, utcNow);
        return await db.PaymentSubmissions
            .Where(s => s.StudentUserId == userId && s.BillingYear == billingYear && s.BillingMonth == billingMonth)
            .OrderByDescending(s => s.SubmittedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<(bool Success, string? Error, PaymentSubmission? Submission)> SubmitPaymentAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);
        if (user is null)
            return (false, "Account not found.", null);

        if (user.ApplicationStatus != ApplicationStatusCodes.Active)
            return (false, "Payments are available after you accept your lesson schedule.", null);

        var utcNow = DateTime.UtcNow;
        var (billingYear, billingMonth) = LessonBillingService.ResolveBillingMonth(user, utcNow);
        var existing = await db.PaymentSubmissions
            .Where(s => s.StudentUserId == userId && s.BillingYear == billingYear && s.BillingMonth == billingMonth)
            .OrderByDescending(s => s.SubmittedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (existing?.Status == PaymentSubmissionStatusCodes.Paid)
            return (false, "This billing period is already marked as paid.", null);

        if (existing?.Status == PaymentSubmissionStatusCodes.PendingVerification)
            return (false, "Your payment is already pending verification.", null);

        var (monthStart, monthEnd) = LessonBillingService.MonthRangeUtc(billingYear, billingMonth);
        var lessons = await db.LessonSlots.AsNoTracking()
            .Where(s => s.StudentUserId == userId && s.StartsAtUtc >= monthStart && s.StartsAtUtc < monthEnd)
            .ToListAsync(cancellationToken);

        var settings = await schedulingSettings.GetEntityAsync(cancellationToken);
        var statement = LessonBillingService.BuildStatement(
            user,
            lessons,
            settings,
            billingYear,
            billingMonth,
            existing,
            utcNow);

        if (statement.TotalAmount <= 0)
            return (false, "There are no billable lessons for this billing period.", null);

        var summary = StudentPaymentSummaryBuilder.Build(user, existing, utcNow);
        if (!summary.CanSubmitPayment)
            return (false, "Payment submission is not available right now.", null);

        var submission = new PaymentSubmission
        {
            Id = Guid.NewGuid(),
            StudentUserId = userId,
            BillingYear = billingYear,
            BillingMonth = billingMonth,
            Status = PaymentSubmissionStatusCodes.PendingVerification,
            Amount = statement.TotalAmount,
            Currency = statement.Currency,
            PaymentReference = statement.PaymentReference,
            SubmittedAtUtc = utcNow,
        };

        db.PaymentSubmissions.Add(submission);
        await db.SaveChangesAsync(cancellationToken);
        return (true, null, submission);
    }

    public async Task<IReadOnlyList<StudentPaymentHistoryItemDto>> GetPaymentHistoryAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var submissions = await db.PaymentSubmissions.AsNoTracking()
            .Where(s => s.StudentUserId == userId && s.Status == PaymentSubmissionStatusCodes.Paid)
            .OrderByDescending(s => s.ReviewedAtUtc ?? s.SubmittedAtUtc)
            .ToListAsync(cancellationToken);

        return submissions.Select(s => new StudentPaymentHistoryItemDto
        {
            Id = s.Id,
            BillingYear = s.BillingYear,
            BillingMonth = s.BillingMonth,
            BillingPeriodLabel = LessonBillingService.FormatBillingPeriod(s.BillingYear, s.BillingMonth),
            Status = s.Status,
            Amount = s.Amount,
            Currency = s.Currency,
            SubmittedAtUtc = s.SubmittedAtUtc,
            ReviewedAtUtc = s.ReviewedAtUtc,
        }).ToList();
    }
}
