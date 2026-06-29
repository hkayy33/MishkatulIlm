using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;

namespace MishkatulIlm_Server.Services;

public sealed class AdminPaymentSubmissionService(
    AppDbContext db,
    SchedulingSettingsService schedulingSettings,
    LessonBillingContextService billingContext,
    LessonRolloverService lessonRollover)
{
    public async Task<IReadOnlyList<AdminPaymentSubmissionListItemDto>> ListAsync(
        string? statusFilter,
        CancellationToken cancellationToken = default)
    {
        var query = db.PaymentSubmissions.AsNoTracking()
            .Include(s => s.Student)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(statusFilter))
            query = query.Where(s => s.Status == statusFilter.Trim());

        var rows = await query
            .OrderByDescending(s => s.SubmittedAtUtc)
            .ToListAsync(cancellationToken);

        var paidPeriods = await db.PaymentSubmissions.AsNoTracking()
            .Where(s => s.Status == PaymentSubmissionStatusCodes.Paid)
            .Select(s => new { s.StudentUserId, s.BillingYear, s.BillingMonth })
            .ToListAsync(cancellationToken);

        var paidPeriodSet = paidPeriods
            .Select(p => (p.StudentUserId, p.BillingYear, p.BillingMonth))
            .ToHashSet();

        rows = rows
            .Where(r =>
                r.Status != PaymentSubmissionStatusCodes.Rejected
                || !paidPeriodSet.Contains((r.StudentUserId, r.BillingYear, r.BillingMonth)))
            .ToList();

        var settings = await schedulingSettings.GetEntityAsync(cancellationToken);
        var items = new List<AdminPaymentSubmissionListItemDto>();

        foreach (var row in rows)
        {
            var student = row.Student!;
            var lessons = await billingContext.LoadBillableLessonsAsync(
                await billingContext.ResolveAsync(student, DateTime.UtcNow, cancellationToken),
                row.StudentUserId,
                cancellationToken);

            if (lessons.Count == 0)
            {
                var (monthStart, monthEnd) = LessonBillingService.MonthRangeUtc(row.BillingYear, row.BillingMonth);
                lessons = await db.LessonSlots.AsNoTracking()
                    .Where(s => s.StudentUserId == row.StudentUserId && s.StartsAtUtc >= monthStart && s.StartsAtUtc < monthEnd)
                    .OrderBy(s => s.StartsAtUtc)
                    .ToListAsync(cancellationToken);
            }

            var billing = await billingContext.ResolveAsync(student, DateTime.UtcNow, cancellationToken);
            if (billing.BillingYear != row.BillingYear || billing.BillingMonth != row.BillingMonth)
                billing = new BillingResolution(row.BillingYear, row.BillingMonth, false, null);

            var planned = await LessonRolloverPlanner.TryPlanNextBlockAsync(
                db,
                row.StudentUserId,
                DateTime.UtcNow,
                cancellationToken);
            if (planned is { Count: > 0 })
            {
                var (lessonYear, lessonMonth) = LessonBillingService.BillingMonthForLessonStart(planned[0].StartsAtUtc);
                if (lessonYear == row.BillingYear && lessonMonth == row.BillingMonth)
                {
                    billing = new BillingResolution(row.BillingYear, row.BillingMonth, true, planned);
                    lessons = LessonBillingService.SyntheticSlotsFromPlanned(planned).ToList();
                }
            }

            var statement = LessonBillingService.BuildStatement(
                student,
                lessons,
                settings,
                billing.BillingYear,
                billing.BillingMonth,
                row,
                DateTime.UtcNow,
                billing.IsRolloverBlock && billing.PlannedRollover is { Count: > 0 }
                    ? LessonBillingService.FormatRolloverBillingPeriod(billing.PlannedRollover)
                    : null,
                billing.IsRolloverBlock);

            items.Add(new AdminPaymentSubmissionListItemDto
            {
                Id = row.Id,
                StudentUserId = row.StudentUserId,
                StudentName = $"{student.FirstName} {student.LastName}".Trim(),
                Email = student.Email,
                BillingYear = row.BillingYear,
                BillingMonth = row.BillingMonth,
                BillingPeriodLabel = statement.BillingPeriodLabel,
                Status = row.Status,
                Amount = row.Amount,
                Currency = row.Currency,
                PaymentReference = row.PaymentReference,
                SubmittedAtUtc = row.SubmittedAtUtc,
                ReviewedAtUtc = row.ReviewedAtUtc,
                AdminNote = row.AdminNote,
                Lessons = statement.Lessons,
            });
        }

        return items;
    }

    public Task<(bool Success, string? Error, string? Message)> ApproveAsync(
        Guid submissionId,
        Guid adminUserId,
        string? adminNote,
        CancellationToken cancellationToken = default) =>
        ApproveCoreAsync(submissionId, adminUserId, adminNote, cancellationToken);

    public Task<(bool Success, string? Error, string? Message)> ApproveAutomaticallyAsync(
        Guid submissionId,
        CancellationToken cancellationToken = default) =>
        ApproveCoreAsync(submissionId, reviewedByAdminUserId: null, adminNote: "Confirmed by Flutterwave.", cancellationToken);

    private async Task<(bool Success, string? Error, string? Message)> ApproveCoreAsync(
        Guid submissionId,
        Guid? reviewedByAdminUserId,
        string? adminNote,
        CancellationToken cancellationToken)
    {
        var submission = await db.PaymentSubmissions
            .Include(s => s.Student)
            .FirstOrDefaultAsync(s => s.Id == submissionId, cancellationToken);

        if (submission is null)
            return (false, "Payment submission not found.", null);

        if (submission.Status != PaymentSubmissionStatusCodes.PendingVerification)
            return (false, "Only pending submissions can be approved.", null);

        var user = submission.Student!;
        var utcNow = DateTime.UtcNow;
        submission.Status = PaymentSubmissionStatusCodes.Paid;
        submission.ReviewedAtUtc = utcNow;
        submission.ReviewedByAdminUserId = reviewedByAdminUserId;
        submission.AdminNote = string.IsNullOrWhiteSpace(adminNote) ? null : adminNote.Trim();

        user.LastPaymentAmount = submission.Amount;
        user.LastPaymentCurrency = submission.Currency;
        user.LastPaymentAtUtc = utcNow;
        user.NextPaymentDueUtc = LessonBillingService.NextPaymentDueAfterPaid(utcNow);

        await db.SaveChangesAsync(cancellationToken);
        var rollover = await lessonRollover.TryRolloverStudentAsync(user.Id, cancellationToken);

        var message = reviewedByAdminUserId is null
            ? "Payment received. Thank you!"
            : "Payment marked as paid.";
        if (rollover.AdminFacingMessage is not null)
            message = $"{message} {rollover.AdminFacingMessage}";

        return (true, null, message);
    }

    public async Task<(bool Success, string? Error, string? Message)> RejectAsync(
        Guid submissionId,
        Guid adminUserId,
        string? adminNote,
        CancellationToken cancellationToken = default)
    {
        var submission = await db.PaymentSubmissions
            .FirstOrDefaultAsync(s => s.Id == submissionId, cancellationToken);

        if (submission is null)
            return (false, "Payment submission not found.", null);

        if (submission.Status != PaymentSubmissionStatusCodes.PendingVerification)
            return (false, "Only pending submissions can be rejected.", null);

        submission.Status = PaymentSubmissionStatusCodes.Rejected;
        submission.ReviewedAtUtc = DateTime.UtcNow;
        submission.ReviewedByAdminUserId = adminUserId;
        submission.AdminNote = string.IsNullOrWhiteSpace(adminNote) ? null : adminNote.Trim();

        await db.SaveChangesAsync(cancellationToken);
        return (true, null, "Payment submission rejected.");
    }
}
