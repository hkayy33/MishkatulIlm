using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Authentication;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;
using MishkatulIlm_Server.Services;

namespace MishkatulIlm_Server.Controllers;

[ApiController]
[Authorize]
[Route("api/student")]
public sealed class StudentController(
    AppDbContext db,
    StudentAccountDeletionService accountDeletion,
    StripeSubscriptionSyncService subscriptionSync) : ControllerBase
{
    [HttpGet("portal")]
    public async Task<IActionResult> GetPortal(
        [FromQuery] int? year,
        [FromQuery] int? month,
        CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        var user = await db.Users
            .Include(u => u.Onboarding)
            .FirstOrDefaultAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);

        if (user is null)
            return NotFound(new { message = "Account not found." });

        if (user.ApplicationStatus != ApplicationStatusCodes.Active)
            return BadRequest(new { message = "Your student portal is available after you accept your lesson schedule." });

        await subscriptionSync.TrySyncUserFromStripeAsync(user, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        var now = DateTime.UtcNow;
        var viewYear = year ?? now.Year;
        var viewMonth = month is >= 1 and <= 12 ? month.Value : now.Month;
        var monthStart = new DateTime(viewYear, viewMonth, 1, 0, 0, 0, DateTimeKind.Utc);
        var monthEnd = monthStart.AddMonths(1);

        var lessons = await db.LessonSlots
            .AsNoTracking()
            .Where(s => s.StudentUserId == userId && s.StartsAtUtc < monthEnd && s.EndsAtUtc > monthStart)
            .OrderBy(s => s.StartsAtUtc)
            .ToListAsync(cancellationToken);

        var past = lessons.Where(l => l.EndsAtUtc <= now).ToList();
        var upcoming = lessons.Where(l => l.StartsAtUtc > now).ToList();

        var hasPendingChange = await db.ScheduleChangeRequests.AsNoTracking()
            .AnyAsync(
                r => r.StudentUserId == userId && r.Status == ScheduleChangeRequestCodes.Pending,
                cancellationToken);

        var latestChangeRequest = await db.ScheduleChangeRequests
            .AsNoTracking()
            .Where(r => r.StudentUserId == userId)
            .OrderByDescending(r => r.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        var nextLessonSlot = await db.LessonSlots
            .AsNoTracking()
            .Where(s => s.StudentUserId == userId && s.EndsAtUtc > now)
            .OrderBy(s => s.StartsAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        return Ok(
            new StudentPortalResponse
            {
                Portal = new StudentPortalDto
                {
                    Status = "active",
                    NextLesson = nextLessonSlot is null ? null : ToLessonDto(nextLessonSlot),
                    Payment = StudentPaymentSummaryBuilder.Build(user),
                    MonthSummary = new StudentLessonMonthSummaryDto
                    {
                        PastLessonsCount = past.Count,
                        UpcomingLessonsCount = upcoming.Count,
                        AttendingCount = lessons.Count(l => l.AttendanceStatus == AttendanceStatusCodes.Attending),
                        NotAttendingCount = lessons.Count(l => l.AttendanceStatus == AttendanceStatusCodes.NotAttending),
                    },
                    HasPendingScheduleChangeRequest = hasPendingChange,
                    ScheduleChangeUpdate = latestChangeRequest is null
                        ? null
                        : ToScheduleChangeUpdateDto(latestChangeRequest),
                    DeletionRequested = user.DeletionRequestedAtUtc is not null,
                },
                Lessons = lessons
                    .Select(ToLessonDto)
                    .ToList(),
                Country = user.Onboarding?.Country,
                City = user.Onboarding?.City,
            });
    }

    [HttpPatch("lessons/{slotId:guid}/attendance")]
    public async Task<IActionResult> UpdateAttendance(
        Guid slotId,
        [FromBody] UpdateLessonAttendanceRequest request,
        CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        if (!AttendanceStatusCodes.TryNormalize(request.AttendanceStatus, out var status, out var error))
            return BadRequest(new { message = error });

        var slot = await db.LessonSlots
            .FirstOrDefaultAsync(s => s.Id == slotId && s.StudentUserId == userId, cancellationToken);

        if (slot is null)
            return NotFound(new { message = "Lesson not found." });

        slot.AttendanceStatus = status;
        await db.SaveChangesAsync(cancellationToken);

        return Ok(ToLessonDto(slot));
    }

    [HttpPatch("lessons/{slotId:guid}/note")]
    public async Task<IActionResult> UpdateLessonNote(
        Guid slotId,
        [FromBody] UpdateLessonNoteRequest request,
        CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        var note = (request.Note ?? string.Empty).Trim();
        if (note.Length > 2000)
            return BadRequest(new { message = "Your note must be 2000 characters or fewer." });

        var slot = await db.LessonSlots
            .FirstOrDefaultAsync(s => s.Id == slotId && s.StudentUserId == userId, cancellationToken);

        if (slot is null)
            return NotFound(new { message = "Lesson not found." });

        slot.StudentNote = note.Length == 0 ? null : note;
        await db.SaveChangesAsync(cancellationToken);

        return Ok(ToLessonDto(slot));
    }

    [HttpPost("schedule-change-request")]
    public async Task<IActionResult> RequestScheduleChange(
        [FromBody] ScheduleChangeRequestBody request,
        CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        var note = request.Note.Trim();
        if (note.Length < 10)
            return BadRequest(new { message = "Please describe what you would like to change (at least 10 characters)." });

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);
        if (user is null)
            return NotFound(new { message = "Account not found." });

        if (user.ApplicationStatus != ApplicationStatusCodes.Active)
            return BadRequest(new { message = "Schedule change requests are only available for active students." });

        var pending = await db.ScheduleChangeRequests
            .Where(r => r.StudentUserId == userId && r.Status == ScheduleChangeRequestCodes.Pending)
            .ToListAsync(cancellationToken);

        foreach (var row in pending)
            row.Status = ScheduleChangeRequestCodes.Resolved;

        db.ScheduleChangeRequests.Add(
            new ScheduleChangeRequest
            {
                Id = Guid.NewGuid(),
                StudentUserId = userId,
                Note = note,
                Status = ScheduleChangeRequestCodes.Pending,
                AdminResponseMessage = null,
                CreatedAtUtc = DateTime.UtcNow,
            });

        await db.SaveChangesAsync(cancellationToken);

        return Ok(new { message = "Your schedule change request has been sent to your teacher." });
    }

    [HttpPost("delete-account")]
    public async Task<IActionResult> DeleteAccount(
        [FromBody] DeleteAccountRequest request,
        CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        if (!string.Equals(request.Confirmation.Trim(), "DELETE", StringComparison.Ordinal))
            return BadRequest(new { message = "Type DELETE to confirm account removal." });

        var result = await accountDeletion.DeleteStudentAccountAsync(userId, cancellationToken);
        return result switch
        {
            DeleteStudentAccountStatus.NotFound => NotFound(new { message = "Account not found." }),
            DeleteStudentAccountStatus.Deleted => Ok(
                new { message = "Your account has been permanently deleted." }),
            DeleteStudentAccountStatus.AuthNotConfigured => StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                new
                {
                    message =
                        "Account deletion is not fully configured on the server. Your profile was not removed. Please contact support.",
                }),
            DeleteStudentAccountStatus.AuthDeleteFailed => StatusCode(
                StatusCodes.Status502BadGateway,
                new
                {
                    message =
                        "Could not remove your login from authentication. Your profile was not deleted. Please try again or contact support.",
                }),
            _ => Problem("Could not delete your account."),
        };
    }

    private static StudentScheduleChangeUpdateDto ToScheduleChangeUpdateDto(ScheduleChangeRequest row) =>
        new()
        {
            Status = row.Status switch
            {
                ScheduleChangeRequestCodes.Resolved => "resolved",
                ScheduleChangeRequestCodes.Declined => "declined",
                _ => "pending",
            },
            RequestNote = row.Note,
            AdminMessage = row.AdminResponseMessage,
            CreatedAtUtc = row.CreatedAtUtc,
            ResolvedAtUtc = row.ResolvedAtUtc,
        };

    private static StudentLessonDto ToLessonDto(LessonSlot slot) =>
        new()
        {
            SlotId = slot.Id,
            StartsAtUtc = slot.StartsAtUtc,
            EndsAtUtc = slot.EndsAtUtc,
            DurationMinutes = (int)(slot.EndsAtUtc - slot.StartsAtUtc).TotalMinutes,
            AttendanceStatus = AttendanceStatusCodes.ToApiValue(slot.AttendanceStatus),
            StudentNote = string.IsNullOrWhiteSpace(slot.StudentNote) ? null : slot.StudentNote.Trim(),
        };
}

public sealed class StudentPortalResponse
{
    public StudentPortalDto Portal { get; init; } = new();
    public IReadOnlyList<StudentLessonDto> Lessons { get; init; } = Array.Empty<StudentLessonDto>();
    public string? Country { get; init; }
    public string? City { get; init; }
}
