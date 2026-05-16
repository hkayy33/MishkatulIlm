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
[Route("api/admin/calendar")]
public sealed class AdminCalendarController(AppDbContext db) : ControllerBase
{
    /// <summary>Slots every 30 minutes, 8:00–22:00 UTC; open unless booked.</summary>
    [HttpGet("availability")]
    public async Task<IActionResult> GetAvailability(
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        [FromQuery] Guid? forStudentUserId,
        [FromQuery] int durationMinutes = 0,
        CancellationToken cancellationToken = default)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        if (durationMinutes > 0
            && !LessonScheduleService.TryNormalizeDuration(durationMinutes, out _, out var durationError))
            return BadRequest(new { message = durationError });

        var from = fromUtc ?? DateTime.UtcNow.Date;
        var to = toUtc ?? from.AddDays(35);
        if (to <= from)
            return BadRequest(new { message = "toUtc must be after fromUtc." });

        List<string>? preferred = null;
        if (forStudentUserId is { } studentId)
        {
            var profile = await db.StudentOnboardingProfiles.AsNoTracking()
                .FirstOrDefaultAsync(p => p.UserId == studentId, cancellationToken);
            preferred = profile?.PreferredAvailability;
        }

        var booked = await db.LessonSlots.AsNoTracking()
            .Include(s => s.Student)
            .Where(s => s.StartsAtUtc < to && s.EndsAtUtc > from)
            .ToListAsync(cancellationToken);

        var grid = LessonScheduleService.BuildAvailability(from, to, booked, preferred, durationMinutes);
        return Ok(grid);
    }

    [HttpGet("slots")]
    public Task<IActionResult> ListSlots(
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        [FromQuery] bool availableOnly = false,
        CancellationToken cancellationToken = default) =>
        GetAvailability(fromUtc, toUtc, null, 60, cancellationToken);

    [HttpPost("slots")]
    public async Task<IActionResult> CreateSlot(
        [FromBody] CreateLessonSlotRequest request,
        CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        if (request.EndsAtUtc <= request.StartsAtUtc)
            return BadRequest(new { message = "End time must be after start time." });

        var start = DateTime.SpecifyKind(request.StartsAtUtc, DateTimeKind.Utc);
        var end = DateTime.SpecifyKind(request.EndsAtUtc, DateTimeKind.Utc);

        var booked = await db.LessonSlots.AsNoTracking()
            .Include(s => s.Student)
            .Where(s => s.StartsAtUtc < end && s.EndsAtUtc > start)
            .ToListAsync(cancellationToken);

        if (booked.Any(s => s.StudentUserId is not null))
            return Conflict(new { message = "That time is already booked by a student." });

        var existing = booked.FirstOrDefault();
        if (existing is not null)
        {
            return Ok(
                new LessonSlotDto
                {
                    SlotId = existing.Id,
                    StartsAtUtc = existing.StartsAtUtc,
                    EndsAtUtc = existing.EndsAtUtc,
                    IsBooked = false,
                });
        }

        var slot = new LessonSlot
        {
            Id = Guid.NewGuid(),
            StartsAtUtc = start,
            EndsAtUtc = end,
            CreatedAtUtc = DateTime.UtcNow,
        };
        db.LessonSlots.Add(slot);
        await db.SaveChangesAsync(cancellationToken);

        return Created(
            $"/api/admin/calendar/slots/{slot.Id}",
            new LessonSlotDto
            {
                SlotId = slot.Id,
                StartsAtUtc = slot.StartsAtUtc,
                EndsAtUtc = slot.EndsAtUtc,
                IsBooked = false,
            });
    }

    [HttpDelete("slots/{slotId:guid}")]
    public async Task<IActionResult> DeleteSlot(Guid slotId, CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        var slot = await db.LessonSlots.FirstOrDefaultAsync(s => s.Id == slotId, cancellationToken);
        if (slot is null)
            return NotFound();

        if (slot.StudentUserId is not null)
            return Conflict(new { message = "Cannot delete a booked lesson." });

        db.LessonSlots.Remove(slot);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    /// <summary>Removes every row in lesson_slots (admin testing).</summary>
    [HttpDelete("slots")]
    public async Task<IActionResult> ClearAllSlots(CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        var removed = await db.LessonSlots.ExecuteDeleteAsync(cancellationToken);
        return Ok(new { message = $"Cleared {removed} lesson slot(s).", removed });
    }

    [HttpPost("preview-booking")]
    public async Task<IActionResult> PreviewBooking(
        [FromBody] PreviewBookingRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        if (request.WeekOneLessons is not { Count: > 0 })
            return BadRequest(new { message = "Select lesson slots in the start week to preview." });

        var profile = await db.StudentOnboardingProfiles.AsNoTracking()
            .FirstOrDefaultAsync(p => p.UserId == request.UserId, cancellationToken);
        if (profile is null)
            return NotFound();

        if (!LessonScheduleService.TryValidateWeekOneLessons(
                request.WeekOneLessons,
                profile.LessonFrequency,
                out var weekOneError))
            return BadRequest(new { message = weekOneError });

        var planned = LessonScheduleService.PlanFromWeekOneLessons(
            request.WeekOneLessons,
            profile.LessonFrequency);

        return Ok(
            new
            {
                lessonCount = planned.Count,
                lessonFrequency = profile.LessonFrequency,
                plannedStartsUtc = planned.Select(l => l.StartsAtUtc).ToList(),
                plannedLessons = planned,
                bookingWeeks = LessonScheduleService.BookingWeeks,
            });
    }

    private async Task<bool> IsCurrentUserAdminAsync(CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return false;

        return await db.Users.AsNoTracking().AnyAsync(u => u.Id == userId && u.IsAdmin, cancellationToken);
    }
}
