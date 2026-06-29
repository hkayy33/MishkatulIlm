using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;

namespace MishkatulIlm_Server.Services;

/// <summary>Plans the next 4-week lesson block when a student's current block has ended.</summary>
public static class LessonRolloverPlanner
{
    public static async Task<IReadOnlyList<PlannedLessonSlotDto>?> TryPlanNextBlockAsync(
        AppDbContext db,
        Guid studentUserId,
        DateTime utcNow,
        CancellationToken cancellationToken = default)
    {
        var user = await db.Users
            .AsNoTracking()
            .Include(u => u.Onboarding)
            .FirstOrDefaultAsync(u => u.Id == studentUserId && !u.IsAdmin, cancellationToken);

        if (user is null)
            return null;

        if (user.ApplicationStatus != ApplicationStatusCodes.Active)
            return null;

        if (user.DeletionRequestedAtUtc is not null)
            return null;

        var hasPendingChange = await db.ScheduleChangeRequests.AsNoTracking()
            .AnyAsync(
                r => r.StudentUserId == studentUserId && r.Status == ScheduleChangeRequestCodes.Pending,
                cancellationToken);

        if (hasPendingChange)
            return null;

        var hasUpcoming = await db.LessonSlots.AsNoTracking()
            .AnyAsync(s => s.StudentUserId == studentUserId && s.EndsAtUtc > utcNow, cancellationToken);

        if (hasUpcoming)
            return null;

        var lessons = await db.LessonSlots.AsNoTracking()
            .Where(s => s.StudentUserId == studentUserId)
            .OrderBy(s => s.StartsAtUtc)
            .Select(s => new { s.StartsAtUtc, s.EndsAtUtc })
            .ToListAsync(cancellationToken);

        if (lessons.Count == 0)
            return null;

        var lessonFrequency = user.Onboarding?.LessonFrequency?.Trim();
        if (string.IsNullOrWhiteSpace(lessonFrequency))
            lessonFrequency = "ONCE-WEEK";

        var weekOne = LessonScheduleService.ExtractWeekOneLessonsFromLastBlock(
            lessons.Select(l => (l.StartsAtUtc, l.EndsAtUtc)).ToList());

        if (weekOne.Count == 0)
            return null;

        var planned = LessonScheduleService.PlanRolloverBlock(weekOne, lessonFrequency);
        if (planned.Count == 0)
            return null;

        if (planned.Any(l => l.StartsAtUtc < utcNow.AddMinutes(-5)))
            return null;

        return planned;
    }
}
