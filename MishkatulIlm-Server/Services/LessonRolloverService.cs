using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;

namespace MishkatulIlm_Server.Services;

/// <summary>
/// When a student's current 4-week lesson block has fully ended, books the next block
/// using the same weekly pattern as their last block — only after payment for that block
/// has been verified.
/// </summary>
public sealed class LessonRolloverService(
    AppDbContext db,
    ScheduleProposalService scheduleProposals,
    LessonBillingContextService billingContext,
    ILogger<LessonRolloverService> logger)
{
    public async Task<RolloverAttemptResult> TryRolloverStudentAsync(
        Guid studentUserId,
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var planned = await LessonRolloverPlanner.TryPlanNextBlockAsync(db, studentUserId, now, cancellationToken);
        if (planned is null || planned.Count == 0)
            return RolloverAttemptResult.NotApplicable();

        var user = await db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == studentUserId && !u.IsAdmin, cancellationToken);

        if (user is null)
            return RolloverAttemptResult.NotApplicable();

        var billing = await billingContext.ResolveAsync(user, now, cancellationToken);
        var billingPeriodPaid = await billingContext.IsBillingPeriodPaidAsync(
            studentUserId,
            billing,
            cancellationToken);

        if (!billingPeriodPaid)
        {
            var period = billing.IsRolloverBlock && billing.PlannedRollover is { Count: > 0 }
                ? LessonBillingService.FormatRolloverBillingPeriod(billing.PlannedRollover)
                : LessonBillingService.FormatBillingPeriod(billing.BillingYear, billing.BillingMonth);

            logger.LogInformation(
                "Lesson rollover skipped for {StudentId}: {BillingPeriod} is not marked paid.",
                studentUserId,
                period);

            return RolloverAttemptResult.AwaitingPayment(period);
        }

        var plannedDtos = planned
            .Select(l => new PlannedLessonSlotDto
            {
                StartsAtUtc = l.StartsAtUtc,
                EndsAtUtc = l.EndsAtUtc,
                DurationMinutes = l.DurationMinutes,
            })
            .ToList();

        var validationError = await scheduleProposals.ValidatePlannedLessonsAsync(
            studentUserId,
            plannedDtos,
            cancellationToken);

        if (validationError is not null)
        {
            logger.LogWarning(
                "Lesson rollover skipped for {StudentId}: {Reason}",
                studentUserId,
                validationError);
            return RolloverAttemptResult.Conflict(validationError);
        }

        try
        {
            var proposed = planned
                .Select(l => new ProposedLessonSlot
                {
                    StartsAtUtc = l.StartsAtUtc,
                    EndsAtUtc = l.EndsAtUtc,
                    DurationMinutes = l.DurationMinutes,
                })
                .ToList();

            await scheduleProposals.BookPlannedLessonsAsync(studentUserId, proposed, cancellationToken);

            logger.LogInformation(
                "Lesson rollover booked {LessonCount} lessons for student {StudentId} starting {FirstLessonUtc:u}.",
                proposed.Count,
                studentUserId,
                proposed[0].StartsAtUtc);

            return RolloverAttemptResult.Booked(proposed.Count, proposed[0].StartsAtUtc);
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(
                ex,
                "Lesson rollover failed for student {StudentId} due to a calendar conflict.",
                studentUserId);
            return RolloverAttemptResult.Conflict(ex.Message);
        }
    }

    public async Task<int> RolloverDueStudentsAsync(CancellationToken cancellationToken = default)
    {
        var studentIds = await db.Users.AsNoTracking()
            .Where(u => !u.IsAdmin && u.ApplicationStatus == ApplicationStatusCodes.Active)
            .Where(u => u.DeletionRequestedAtUtc == null)
            .Select(u => u.Id)
            .ToListAsync(cancellationToken);

        var rolled = 0;
        foreach (var studentId in studentIds)
        {
            var result = await TryRolloverStudentAsync(studentId, cancellationToken);
            if (result.Outcome == RolloverOutcome.Booked)
                rolled++;
        }

        return rolled;
    }

    public async Task<string?> ResolveNextBlockBookingIssueAsync(
        Guid studentUserId,
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var planned = await LessonRolloverPlanner.TryPlanNextBlockAsync(db, studentUserId, now, cancellationToken);
        if (planned is null || planned.Count == 0)
            return null;

        var hasUpcoming = await db.LessonSlots.AsNoTracking()
            .AnyAsync(s => s.StudentUserId == studentUserId && s.EndsAtUtc > now, cancellationToken);
        if (hasUpcoming)
            return null;

        var user = await db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == studentUserId && !u.IsAdmin, cancellationToken);
        if (user is null)
            return null;

        var billing = await billingContext.ResolveAsync(user, now, cancellationToken);
        var billingPeriodPaid = await billingContext.IsBillingPeriodPaidAsync(
            studentUserId,
            billing,
            cancellationToken);
        if (!billingPeriodPaid)
            return null;

        var plannedDtos = planned
            .Select(l => new PlannedLessonSlotDto
            {
                StartsAtUtc = l.StartsAtUtc,
                EndsAtUtc = l.EndsAtUtc,
                DurationMinutes = l.DurationMinutes,
            })
            .ToList();

        return await scheduleProposals.ValidatePlannedLessonsAsync(studentUserId, plannedDtos, cancellationToken) is { } error
            ? RolloverAttemptResult.Conflict(error).UserFacingMessage
            : null;
    }
}
