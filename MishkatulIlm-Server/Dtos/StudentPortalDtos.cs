namespace MishkatulIlm_Server.Dtos;

public sealed class StudentPortalDto
{
    public string Status { get; init; } = "active";
    public StudentPaymentSummaryDto Payment { get; init; } = new();
    public StudentLessonMonthSummaryDto MonthSummary { get; init; } = new();
    public StudentLessonDto? NextLesson { get; init; }
    public bool HasPendingScheduleChangeRequest { get; init; }
    public StudentScheduleChangeUpdateDto? ScheduleChangeUpdate { get; init; }
    public bool DeletionRequested { get; init; }
    public string? TimeZoneId { get; init; }
}

public sealed class StudentPaymentSummaryDto
{
    public DateTime? NextPaymentDueUtc { get; init; }
    public decimal? LastPaymentAmount { get; init; }
    public string LastPaymentCurrency { get; init; } = "GBP";
    public DateTime? LastPaymentAtUtc { get; init; }

    /// <summary>True when the student must pay before their first lesson.</summary>
    public bool RequiresInitialPayment { get; init; }
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
    public string? StudentNote { get; init; }
}

public sealed class UpdateLessonNoteRequest
{
    [System.Text.Json.Serialization.JsonPropertyName("note")]
    public string Note { get; set; } = string.Empty;
}

public sealed class UpdateLessonAttendanceRequest
{
    [System.Text.Json.Serialization.JsonPropertyName("attendanceStatus")]
    public string AttendanceStatus { get; set; } = "attending";
}

public sealed class StudentScheduleChangeUpdateDto
{
    /// <summary>pending | resolved | declined</summary>
    public string Status { get; init; } = "pending";
    public string RequestNote { get; init; } = string.Empty;
    public string? AdminMessage { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public DateTime? ResolvedAtUtc { get; init; }
}

public sealed class ScheduleChangeRequestBody
{
    public string Note { get; set; } = string.Empty;
}

public sealed class DeleteAccountRequest
{
    public string Confirmation { get; set; } = string.Empty;
}
