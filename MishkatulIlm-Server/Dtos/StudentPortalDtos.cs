namespace MishkatulIlm_Server.Dtos;

public sealed class StudentPortalDto
{
    public string Status { get; init; } = "active";
    public StudentPaymentSummaryDto Payment { get; init; } = new();
    public StudentLessonMonthSummaryDto MonthSummary { get; init; } = new();
    public StudentLessonDto? NextLesson { get; init; }
    public bool HasPendingScheduleChangeRequest { get; init; }
    public bool DeletionRequested { get; init; }
    public string? TimeZoneId { get; init; }
}

public sealed class StudentPaymentSummaryDto
{
    public DateTime? NextPaymentDueUtc { get; init; }
    public decimal? LastPaymentAmount { get; init; }
    public string LastPaymentCurrency { get; init; } = "GBP";
    public DateTime? LastPaymentAtUtc { get; init; }
}

public sealed class StudentLessonMonthSummaryDto
{
    public int PastLessonsCount { get; init; }
    public int UpcomingLessonsCount { get; init; }
    public int AttendingCount { get; init; }
    public int NotAttendingCount { get; init; }
}

public sealed class StudentLessonDto
{
    public Guid SlotId { get; init; }
    public DateTime StartsAtUtc { get; init; }
    public DateTime EndsAtUtc { get; init; }
    public int DurationMinutes { get; init; }
    public string AttendanceStatus { get; init; } = "attending";
}

public sealed class UpdateLessonAttendanceRequest
{
    public string AttendanceStatus { get; set; } = "attending";
}

public sealed class ScheduleChangeRequestBody
{
    public string Note { get; set; } = string.Empty;
}

public sealed class DeleteAccountRequest
{
    public string Confirmation { get; set; } = string.Empty;
}
