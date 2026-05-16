using System.Text.Json.Serialization;

namespace MishkatulIlm_Server.Dtos;

public sealed class UserMeResponse
{
    public Guid UserId { get; init; }
    public string Email { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public bool OnboardingCompleted { get; init; }
    public bool IsAdmin { get; init; }
}

public sealed class AdminUserListItem
{
    public Guid UserId { get; init; }
    public string Email { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public bool OnboardingCompleted { get; init; }
    public DateTime CreatedAtUtc { get; init; }
}

public sealed class AdminApplicationListItem
{
    public Guid UserId { get; init; }
    public string Email { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public bool OnboardingCompleted { get; init; }
    /// <summary>pending | awaiting_reply | active | inactive</summary>
    public string ApplicationStatus { get; init; } = "pending";
    /// <summary>awaiting_student | student_amended | accepted | null</summary>
    public string? ScheduleProposalStatus { get; init; }
    public string? StudentAmendNote { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public string? AgeRange { get; init; }
    public string? Gender { get; init; }
    public string? Country { get; init; }
    public string? City { get; init; }
    public string? CurrentLevel { get; init; }
    public string? LessonFrequency { get; init; }
    public IReadOnlyList<string> SubjectCodes { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> PreferredAvailability { get; init; } = Array.Empty<string>();
}

public sealed class SetApplicationStatusRequest
{
    public string Status { get; set; } = string.Empty;
}

public sealed class AdminStudentListItem
{
    public Guid UserId { get; init; }
    public string Email { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public string AgeRange { get; init; } = string.Empty;
    public string Gender { get; init; } = string.Empty;
    public string CurrentLevel { get; init; } = string.Empty;
    public string LessonFrequency { get; init; } = string.Empty;
    public IReadOnlyList<string> SubjectCodes { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> PreferredAvailability { get; init; } = Array.Empty<string>();
    public IReadOnlyList<ScheduledLessonDto> ScheduledLessons { get; init; } = Array.Empty<ScheduledLessonDto>();
}

public sealed class AdminCreateUserRequest
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public bool IsAdmin { get; set; }
}

/// <summary>Body for <c>POST /api/dev/admin-account</c> (Development only).</summary>
public sealed class DevBootstrapAdminRequest
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string FirstName { get; set; } = "Admin";
    public string LastName { get; set; } = "User";
}

/// <summary>Subset of Supabase <c>POST /auth/v1/admin/users</c> response.</summary>
internal sealed class SupabaseCreateUserResponse
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }
}
