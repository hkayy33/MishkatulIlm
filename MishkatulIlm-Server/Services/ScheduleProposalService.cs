using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;

namespace MishkatulIlm_Server.Services;

public sealed class ScheduleProposalService(AppDbContext db)
{
    public async Task<ScheduleProposal> CreateProposalAsync(
        Guid studentUserId,
        IReadOnlyList<PlannedLessonSlotDto> planned,
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var open = await db.ScheduleProposals
            .Where(p =>
                p.StudentUserId == studentUserId
                && (p.Status == ScheduleProposalCodes.AwaitingStudent
                    || p.Status == ScheduleProposalCodes.StudentAmended))
            .ToListAsync(cancellationToken);

        foreach (var previous in open)
        {
            previous.Status = ScheduleProposalCodes.Superseded;
            previous.UpdatedAtUtc = now;
        }

        var proposal = new ScheduleProposal
        {
            Id = Guid.NewGuid(),
            StudentUserId = studentUserId,
            Status = ScheduleProposalCodes.AwaitingStudent,
            PlannedLessons = planned
                .Select(l => new ProposedLessonSlot
                {
                    StartsAtUtc = DateTime.SpecifyKind(l.StartsAtUtc, DateTimeKind.Utc),
                    EndsAtUtc = DateTime.SpecifyKind(l.EndsAtUtc, DateTimeKind.Utc),
                    DurationMinutes = l.DurationMinutes,
                })
                .ToList(),
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
        };

        db.ScheduleProposals.Add(proposal);
        return proposal;
    }

    public async Task<ScheduleProposal?> GetOpenProposalForStudentAsync(
        Guid studentUserId,
        CancellationToken cancellationToken = default) =>
        await db.ScheduleProposals
            .AsNoTracking()
            .Where(p => p.StudentUserId == studentUserId && p.Status == ScheduleProposalCodes.AwaitingStudent)
            .OrderByDescending(p => p.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<ScheduleProposal?> GetLatestProposalForStudentAsync(
        Guid studentUserId,
        CancellationToken cancellationToken = default) =>
        await db.ScheduleProposals
            .AsNoTracking()
            .Where(p => p.StudentUserId == studentUserId && p.Status != ScheduleProposalCodes.Superseded)
            .OrderByDescending(p => p.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<string?> ValidatePlannedLessonsAsync(
        Guid studentUserId,
        IReadOnlyList<PlannedLessonSlotDto> planned,
        CancellationToken cancellationToken = default)
    {
        if (planned.Count == 0)
            return null;

        var rangeEnd = planned.Max(l => l.EndsAtUtc).AddHours(1);
        var rangeStart = planned.Min(l => l.StartsAtUtc);
        var existing = await db.LessonSlots
            .AsNoTracking()
            .Where(s => s.StartsAtUtc < rangeEnd && s.EndsAtUtc > rangeStart.AddMinutes(-1))
            .ToListAsync(cancellationToken);

        foreach (var lesson in planned)
        {
            var start = DateTime.SpecifyKind(lesson.StartsAtUtc, DateTimeKind.Utc);
            var end = DateTime.SpecifyKind(lesson.EndsAtUtc, DateTimeKind.Utc);
            var conflict = existing.FirstOrDefault(s => s.StartsAtUtc < end && s.EndsAtUtc > start);
            if (conflict?.StudentUserId is not null && conflict.StudentUserId != studentUserId)
            {
                return
                    $"The time {start:u} is already booked. Choose another slot or free the calendar.";
            }
        }

        return null;
    }

    public async Task<List<LessonSlot>> BookPlannedLessonsAsync(
        Guid studentUserId,
        IReadOnlyList<ProposedLessonSlot> planned,
        CancellationToken cancellationToken = default)
    {
        if (planned.Count == 0)
            throw new InvalidOperationException("No lessons to book.");

        var rangeEnd = planned.Max(l => l.EndsAtUtc).AddHours(1);
        var rangeStart = planned.Min(l => l.StartsAtUtc);
        var existing = await db.LessonSlots
            .Include(s => s.Student)
            .Where(s => s.StartsAtUtc < rangeEnd && s.EndsAtUtc > rangeStart.AddMinutes(-1))
            .ToListAsync(cancellationToken);

        var booked = new List<LessonSlot>();
        foreach (var lesson in planned)
        {
            var start = DateTime.SpecifyKind(lesson.StartsAtUtc, DateTimeKind.Utc);
            var end = DateTime.SpecifyKind(lesson.EndsAtUtc, DateTimeKind.Utc);
            var conflict = existing.FirstOrDefault(s => s.StartsAtUtc < end && s.EndsAtUtc > start);
            if (conflict?.StudentUserId is not null && conflict.StudentUserId != studentUserId)
            {
                throw new InvalidOperationException(
                    $"The time {start:u} is already booked. Ask your teacher for an updated schedule.");
            }

            if (conflict is not null)
            {
                conflict.StudentUserId = studentUserId;
                conflict.StartsAtUtc = start;
                conflict.EndsAtUtc = end;
                conflict.AttendanceStatus = AttendanceStatusCodes.Attending;
                conflict.StudentNote = null;
                conflict.Title = null;
                conflict.Description = null;
                booked.Add(conflict);
                continue;
            }

            var slot = new LessonSlot
            {
                Id = Guid.NewGuid(),
                StartsAtUtc = start,
                EndsAtUtc = end,
                StudentUserId = studentUserId,
                CreatedAtUtc = DateTime.UtcNow,
            };
            db.LessonSlots.Add(slot);
            existing.Add(slot);
            booked.Add(slot);
        }

        await db.SaveChangesAsync(cancellationToken);
        return booked;
    }

    public async Task SupersedeOpenProposalsForStudentAsync(
        Guid studentUserId,
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var open = await db.ScheduleProposals
            .Where(p =>
                p.StudentUserId == studentUserId
                && (p.Status == ScheduleProposalCodes.AwaitingStudent
                    || p.Status == ScheduleProposalCodes.StudentAmended
                    || p.Status == ScheduleProposalCodes.Accepted))
            .ToListAsync(cancellationToken);

        foreach (var proposal in open)
        {
            proposal.Status = ScheduleProposalCodes.Superseded;
            proposal.UpdatedAtUtc = now;
        }

        if (open.Count > 0)
            await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Releases all of a student's bookings, then books a new recurring plan.</summary>
    public async Task RescheduleStudentLessonsAsync(
        Guid studentUserId,
        IReadOnlyList<PlannedLessonSlotDto> planned,
        CancellationToken cancellationToken = default)
    {
        var existingBookings = await db.LessonSlots
            .Where(s => s.StudentUserId == studentUserId)
            .ToListAsync(cancellationToken);

        foreach (var slot in existingBookings)
        {
            slot.StudentUserId = null;
            slot.StudentNote = null;
            slot.AttendanceStatus = AttendanceStatusCodes.Attending;
        }

        await db.SaveChangesAsync(cancellationToken);

        if (planned.Count == 0)
            return;

        var proposed = planned
            .Select(l => new ProposedLessonSlot
            {
                StartsAtUtc = DateTime.SpecifyKind(l.StartsAtUtc, DateTimeKind.Utc),
                EndsAtUtc = DateTime.SpecifyKind(l.EndsAtUtc, DateTimeKind.Utc),
                DurationMinutes = l.DurationMinutes,
            })
            .ToList();

        await BookPlannedLessonsAsync(studentUserId, proposed, cancellationToken);
    }

    public static ScheduleProposalDto ToDto(ScheduleProposal proposal) =>
        new()
        {
            ProposalId = proposal.Id,
            Status = ToApiProposalStatus(proposal.Status),
            PlannedLessons = proposal.PlannedLessons
                .OrderBy(l => l.StartsAtUtc)
                .Select(l => new PlannedLessonDto
                {
                    StartsAtUtc = l.StartsAtUtc,
                    EndsAtUtc = l.EndsAtUtc,
                    DurationMinutes = l.DurationMinutes,
                })
                .ToList(),
            StudentAmendNote = proposal.StudentAmendNote,
            CreatedAtUtc = proposal.CreatedAtUtc,
        };

    public static string ToApiProposalStatus(string stored) =>
        stored switch
        {
            ScheduleProposalCodes.AwaitingStudent => "awaiting_student",
            ScheduleProposalCodes.StudentAmended => "student_amended",
            ScheduleProposalCodes.Accepted => "accepted",
            _ => "superseded",
        };
}
