namespace MishkatulIlm_Server.Dtos;

/// <summary>GET /api/onboarding/me — student-facing application status for the dashboard.</summary>
public sealed class StudentApplicationResponse
{
    /// <summary>pending_application | under_review | approved | enrolled</summary>
    public string Status { get; init; } = "pending_application";

    public bool OnboardingCompleted { get; init; }

    public StudentApplicationSummary? Summary { get; init; }
}

public sealed class StudentApplicationSummary
{
    public string CurrentLevel { get; init; } = string.Empty;
    public string LessonFrequency { get; init; } = string.Empty;
    public IReadOnlyList<string> SubjectCodes { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> PreferredAvailability { get; init; } = Array.Empty<string>();
}
