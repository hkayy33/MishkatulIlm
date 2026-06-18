namespace MishkatulIlm_Server.Dtos;

/// <summary>GET /api/onboarding/me — student-facing application status for the dashboard.</summary>
public sealed class StudentApplicationResponse
{
    /// <summary>pending_application | under_review | awaiting_reply | matched | rejected | …</summary>
    public string Status { get; init; } = "pending_application";

    public bool OnboardingCompleted { get; init; }

    /// <summary>Present when <see cref="Status"/> is <c>rejected</c>.</summary>
    public string? RejectionMessage { get; init; }

    public StudentApplicationSummary? Summary { get; init; }

    public ScheduleProposalDto? ScheduleProposal { get; init; }
}

public sealed class StudentApplicationSummary
{
    public string Country { get; init; } = string.Empty;
    public string City { get; init; } = string.Empty;
    public string CurrentLevel { get; init; } = string.Empty;
    public string LessonFrequency { get; init; } = string.Empty;
    public string PreferredLessonDuration { get; init; } = string.Empty;
    public IReadOnlyList<string> SubjectCodes { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> PreferredAvailability { get; init; } = Array.Empty<string>();
}
