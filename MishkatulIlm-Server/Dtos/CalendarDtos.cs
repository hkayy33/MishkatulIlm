namespace MishkatulIlm_Server.Dtos;

public sealed class LessonSlotDto
{
    public Guid SlotId { get; init; }
    public DateTime StartsAtUtc { get; init; }
    public DateTime EndsAtUtc { get; init; }
    public bool IsBooked { get; init; }
    public Guid? StudentUserId { get; init; }
    public string? StudentName { get; init; }
    public string? Title { get; init; }
    public string? Description { get; init; }
}

public sealed class CreateLessonSlotRequest
{
    public DateTime StartsAtUtc { get; set; }
    public DateTime EndsAtUtc { get; set; }
    public string? Title { get; set; }
    public string? Description { get; set; }
}

public sealed class UpdateLessonSlotRequest
{
    public DateTime? StartsAtUtc { get; set; }
    public DateTime? EndsAtUtc { get; set; }
    public string? Title { get; set; }
    public string? Description { get; set; }
}

public sealed class WeekOneLessonSlotDto
{
    public DateTime StartsAtUtc { get; set; }
    public int DurationMinutes { get; set; } = 60;
}

public sealed class PreviewBookingRequest
{
    public Guid UserId { get; set; }
    public List<WeekOneLessonSlotDto> WeekOneLessons { get; set; } = [];
}

public sealed class AvailabilitySlotDto
{
    public DateTime StartsAtUtc { get; init; }
    public DateTime EndsAtUtc { get; init; }
    public int DurationMinutes { get; init; } = 30;
    public IReadOnlyList<int> AvailableDurationMinutes { get; init; } = Array.Empty<int>();
    public bool IsAvailable { get; init; }
    /// <summary>False when the slot is outside the student's preferred day/time windows.</summary>
    public bool MatchesStudentPreference { get; init; } = true;
    public Guid? SlotId { get; init; }
    public Guid? StudentUserId { get; init; }
    public string? StudentName { get; init; }
    public string? StudentCountry { get; init; }
    public string? StudentCity { get; init; }
    /// <summary>attending | not_attending — set when the slot is booked.</summary>
    public string? AttendanceStatus { get; init; }
    public string? StudentLessonNote { get; init; }
    /// <summary>True when this row is an admin-owned calendar entry (unbooked slot in the database).</summary>
    public bool IsAdminCalendarEntry { get; init; }
    public string? Title { get; init; }
    public string? Description { get; init; }
    /// <summary>Top of this grid cell is blocked; bottom remains open (e.g. 45-minute booking).</summary>
    public bool IsPartiallyBlocked { get; init; }
    public DateTime? FreeSegmentStartsAtUtc { get; init; }
    public DateTime? PartialBlockEndsAtUtc { get; init; }
    public DateTime? EntryStartsAtUtc { get; init; }
    public DateTime? EntryEndsAtUtc { get; init; }
}

public sealed class ApproveApplicationRequest
{
    /// <summary>Week-one lessons with per-slot duration; repeated for the next 4 weeks.</summary>
    public List<WeekOneLessonSlotDto>? WeekOneLessons { get; set; }

    /// <summary>Legacy: same duration for each start time.</summary>
    public List<DateTime>? WeekOneLessonStartsUtc { get; set; }

    public int DurationMinutes { get; set; } = 60;

    public DateTime AnchorStartsAtUtc { get; set; }
}

public sealed class ApproveApplicationResponse
{
    public Guid UserId { get; init; }
    public string ApplicationStatus { get; init; } = "awaiting_reply";
    public int LessonsBooked { get; init; }
    public IReadOnlyList<ScheduledLessonDto> ScheduledLessons { get; init; } = Array.Empty<ScheduledLessonDto>();
}

public sealed class ScheduledLessonDto
{
    public Guid SlotId { get; init; }
    public DateTime StartsAtUtc { get; init; }
    public DateTime EndsAtUtc { get; init; }
    public int DurationMinutes { get; init; }
}

public sealed class PlannedLessonSlotDto
{
    public DateTime StartsAtUtc { get; init; }
    public DateTime EndsAtUtc { get; init; }
    public int DurationMinutes { get; init; }
}
