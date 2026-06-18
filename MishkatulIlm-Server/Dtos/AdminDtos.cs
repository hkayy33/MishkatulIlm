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
    public string? PreferredLessonDuration { get; init; }
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
    public bool HasMadePayment { get; init; }
    public DateTime? NextPaymentDueUtc { get; init; }
    public ScheduledLessonDto? NextLesson { get; init; }
    public string? PhoneNumber { get; init; }
    /// <summary>City and country formatted for display, e.g. "London, United Kingdom".</summary>
    public string? Location { get; init; }
    public string? Country { get; init; }
    public string? City { get; init; }
    public string? AgeRange { get; init; }
    public string? Gender { get; init; }
    public string? CurrentLevel { get; init; }
    public string? LessonFrequency { get; init; }
    public string? PreferredLessonDuration { get; init; }
    public IReadOnlyList<string> SubjectCodes { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> PreferredAvailability { get; init; } = Array.Empty<string>();
    public IReadOnlyList<ScheduledLessonDto> ScheduledLessons { get; init; } = Array.Empty<ScheduledLessonDto>();
}

public sealed class AdminStudentLessonHistoryItemDto
{
    public Guid SlotId { get; init; }
    public DateTime StartsAtUtc { get; init; }
    public DateTime EndsAtUtc { get; init; }
    public int DurationMinutes { get; init; }
    /// <summary>attending | not_attending</summary>
    public string AttendanceStatus { get; init; } = "attending";
    public string? StudentNote { get; init; }
}

public sealed class AdminStudentPaymentHistoryItemDto
{
    public Guid Id { get; init; }
    public int BillingYear { get; init; }
    public int BillingMonth { get; init; }
    public string BillingPeriodLabel { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public decimal Amount { get; init; }
    public string Currency { get; init; } = "USD";
    public string PaymentReference { get; init; } = string.Empty;
    public DateTime SubmittedAtUtc { get; init; }
    public DateTime? ReviewedAtUtc { get; init; }
    public string? AdminNote { get; init; }
    public IReadOnlyList<PaymentLessonLineItemDto> Lessons { get; init; } = Array.Empty<PaymentLessonLineItemDto>();
}

public sealed class AdminStudentDetailDto
{
    public Guid UserId { get; init; }
    public string Email { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public bool HasMadePayment { get; init; }
    public DateTime? NextPaymentDueUtc { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public DateTime? LastPaymentAtUtc { get; init; }
    public decimal? LastPaymentAmount { get; init; }
    public string? LastPaymentCurrency { get; init; }
    public string? PhoneNumber { get; init; }
    public string? Location { get; init; }
    public string? Country { get; init; }
    public string? City { get; init; }
    public string? AgeRange { get; init; }
    public string? Gender { get; init; }
    public string? CurrentLevel { get; init; }
    public string? LessonFrequency { get; init; }
    public string? PreferredLessonDuration { get; init; }
    public IReadOnlyList<string> SubjectCodes { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> PreferredAvailability { get; init; } = Array.Empty<string>();
    public IReadOnlyList<ScheduledLessonDto> ScheduledLessons { get; init; } = Array.Empty<ScheduledLessonDto>();
    public IReadOnlyList<AdminStudentLessonHistoryItemDto> LessonHistory { get; init; } =
        Array.Empty<AdminStudentLessonHistoryItemDto>();
    public IReadOnlyList<AdminStudentPaymentHistoryItemDto> PaymentHistory { get; init; } =
        Array.Empty<AdminStudentPaymentHistoryItemDto>();
}

public sealed class AdminBadgeCountsDto
{
    public int PendingApplications { get; init; }
    public int PendingScheduleChanges { get; init; }
    public int PendingPaymentSubmissions { get; init; }
}

public sealed class AdminScheduleChangeRequestListItem
{
    public Guid Id { get; init; }
    public Guid StudentUserId { get; init; }
    public string StudentName { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public string Note { get; init; } = string.Empty;
    public DateTime CreatedAtUtc { get; init; }
    public string? AgeRange { get; init; }
    public string? Gender { get; init; }
    public string? Country { get; init; }
    public string? City { get; init; }
    public string? CurrentLevel { get; init; }
    public string? LessonFrequency { get; init; }
    public string? PreferredLessonDuration { get; init; }
    public IReadOnlyList<string> SubjectCodes { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> PreferredAvailability { get; init; } = Array.Empty<string>();
}

public sealed class DeclineScheduleChangeRequest
{
    public string Message { get; set; } = string.Empty;
}

public sealed class DeclineApplicationRequest
{
    public string Message { get; set; } = string.Empty;
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

/// <summary>Body for <c>POST /api/dev/signup-confirmation-link</c> (Development only).</summary>
public sealed class DevConfirmationLinkRequest
{
    public string Email { get; set; } = string.Empty;
    public string? RedirectTo { get; set; }
}

/// <summary>Body for <c>POST /api/dev/confirm-signup</c> (Development only).</summary>
public sealed class DevConfirmSignupRequest
{
    public string Email { get; set; } = string.Empty;
}

/// <summary>Subset of Supabase <c>POST /auth/v1/admin/users</c> response.</summary>
internal sealed class SupabaseCreateUserResponse
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }
}

/// <summary>Subset of Supabase <c>POST /auth/v1/admin/generate_link</c> response.</summary>
internal sealed class SupabaseGenerateLinkResponse
{
    [JsonPropertyName("action_link")]
    public string? ActionLink { get; set; }

    [JsonPropertyName("redirect_to")]
    public string? RedirectTo { get; set; }

    [JsonPropertyName("properties")]
    public SupabaseGenerateLinkProperties? Properties { get; set; }
}

internal sealed class SupabaseGenerateLinkProperties
{
    [JsonPropertyName("action_link")]
    public string? ActionLink { get; set; }

    [JsonPropertyName("redirect_to")]
    public string? RedirectTo { get; set; }
}

/// <summary>Subset of Supabase <c>GET /auth/v1/admin/users</c> response.</summary>
internal sealed class SupabaseListUsersResponse
{
    [JsonPropertyName("users")]
    public List<SupabaseAdminUserSummary>? Users { get; set; }
}

internal sealed class SupabaseAdminUserSummary
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("email")]
    public string? Email { get; set; }

    [JsonPropertyName("email_confirmed_at")]
    public DateTimeOffset? EmailConfirmedAt { get; set; }
}

/// <summary>Body for <c>POST /api/auth/verify-email-callback</c>.</summary>
public sealed class VerifyEmailCallbackRequest
{
    public string TokenHash { get; set; } = string.Empty;

    /// <summary>Supabase OTP type — usually <c>email</c> for signup confirmation.</summary>
    public string Type { get; set; } = "email";
}

/// <summary>Session returned after verifying an email confirmation link.</summary>
public sealed class VerifyEmailCallbackResponse
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
}

/// <summary>Subset of Supabase <c>POST /auth/v1/verify</c> response.</summary>
public sealed class SupabaseVerifyResponse
{
    [JsonPropertyName("access_token")]
    public string? AccessToken { get; set; }

    [JsonPropertyName("refresh_token")]
    public string? RefreshToken { get; set; }

    [JsonPropertyName("user")]
    public SupabaseVerifyUser? User { get; set; }
}

public sealed class SupabaseVerifyUser
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("email")]
    public string? Email { get; set; }
}
