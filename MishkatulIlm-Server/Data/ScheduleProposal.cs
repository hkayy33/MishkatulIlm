namespace MishkatulIlm_Server.Data;

/// <summary>Proposed lesson plan awaiting student accept/amend before slots are booked.</summary>
public sealed class ScheduleProposal
{
    public Guid Id { get; set; }
    public Guid StudentUserId { get; set; }
    public AppUser Student { get; set; } = null!;
    public string Status { get; set; } = ScheduleProposalCodes.AwaitingStudent;
    public List<ProposedLessonSlot> PlannedLessons { get; set; } = [];
    public string? StudentAmendNote { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
}

public sealed class ProposedLessonSlot
{
    public DateTime StartsAtUtc { get; set; }
    public DateTime EndsAtUtc { get; set; }
    public int DurationMinutes { get; set; }
}
