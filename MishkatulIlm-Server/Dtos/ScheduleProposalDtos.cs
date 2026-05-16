namespace MishkatulIlm_Server.Dtos;

public sealed class ScheduleProposalDto
{
    public Guid ProposalId { get; init; }
    public string Status { get; init; } = "awaiting_student";
    public IReadOnlyList<PlannedLessonDto> PlannedLessons { get; init; } = Array.Empty<PlannedLessonDto>();
    public string? StudentAmendNote { get; init; }
    public DateTime CreatedAtUtc { get; init; }
}

public sealed class PlannedLessonDto
{
    public DateTime StartsAtUtc { get; init; }
    public DateTime EndsAtUtc { get; init; }
    public int DurationMinutes { get; init; }
}

public sealed class AmendScheduleProposalRequest
{
    public string Note { get; set; } = string.Empty;
}
