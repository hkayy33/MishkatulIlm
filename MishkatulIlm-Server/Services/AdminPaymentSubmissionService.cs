using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;

namespace MishkatulIlm_Server.Services;

public sealed class AdminPaymentSubmissionService(
    AppDbContext db,
    SchedulingSettingsService schedulingSettings)
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
            var (monthStart, monthEnd) = LessonBillingService.MonthRangeUtc(row.BillingYear, row.BillingMonth);
            var lessons = await db.LessonSlots.AsNoTracking()
                .Where(s => s.StudentUserId == row.StudentUserId && s.StartsAtUtc >= monthStart && s.StartsAtUtc < monthEnd)
                .OrderBy(s => s.StartsAtUtc)
                .ToListAsync(cancellationToken);

            var student = row.Student!;
            var statement = LessonBillingService.BuildStatement(
                student,
                lessons,
                settings,
                row.BillingYear,
                row.BillingMonth,
                row,
                DateTime.UtcNow);

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

    public async Task<(bool Success, string? Error)> ApproveAsync(
        Guid submissionId,
        Guid adminUserId,
        string? adminNote,
        CancellationToken cancellationToken = default)
    {
        var submission = await db.PaymentSubmissions
            .Include(s => s.Student)
            .FirstOrDefaultAsync(s => s.Id == submissionId, cancellationToken);

        if (submission is null)
            return (false, "Payment submission not found.");

        if (submission.Status != PaymentSubmissionStatusCodes.PendingVerification)
            return (false, "Only pending submissions can be approved.");

        var user = submission.Student!;
        var utcNow = DateTime.UtcNow;
        submission.Status = PaymentSubmissionStatusCodes.Paid;
        submission.ReviewedAtUtc = utcNow;
        submission.ReviewedByAdminUserId = adminUserId;
        submission.AdminNote = string.IsNullOrWhiteSpace(adminNote) ? null : adminNote.Trim();

        user.LastPaymentAmount = submission.Amount;
        user.LastPaymentCurrency = submission.Currency;
        user.LastPaymentAtUtc = utcNow;

        var (_, monthEnd) = LessonBillingService.MonthRangeUtc(submission.BillingYear, submission.BillingMonth);
        user.NextPaymentDueUtc = monthEnd.Date;

        await db.SaveChangesAsync(cancellationToken);
        return (true, null);
    }

    public async Task<(bool Success, string? Error)> RejectAsync(
        Guid submissionId,
        Guid adminUserId,
        string? adminNote,
        CancellationToken cancellationToken = default)
    {
        var submission = await db.PaymentSubmissions
            .FirstOrDefaultAsync(s => s.Id == submissionId, cancellationToken);

        if (submission is null)
            return (false, "Payment submission not found.");

        if (submission.Status != PaymentSubmissionStatusCodes.PendingVerification)
            return (false, "Only pending submissions can be rejected.");

        submission.Status = PaymentSubmissionStatusCodes.Rejected;
        submission.ReviewedAtUtc = DateTime.UtcNow;
        submission.ReviewedByAdminUserId = adminUserId;
        submission.AdminNote = string.IsNullOrWhiteSpace(adminNote) ? null : adminNote.Trim();

        await db.SaveChangesAsync(cancellationToken);
        return (true, null);
    }
}
