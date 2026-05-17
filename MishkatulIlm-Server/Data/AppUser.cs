namespace MishkatulIlm_Server.Data;

/// <summary>Application profile row keyed by Supabase auth user id (<c>auth.users.id</c>).</summary>
public sealed class AppUser
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public bool OnboardingCompleted { get; set; }

    /// <summary>PENDING, ACTIVE, or INACTIVE — admin-managed student application lifecycle.</summary>
    public string ApplicationStatus { get; set; } = ApplicationStatusCodes.Pending;

    /// <summary>When true, the user may call admin APIs and open the admin dashboard.</summary>
    public bool IsAdmin { get; set; }

    public DateTime? NextPaymentDueUtc { get; set; }
    public decimal? LastPaymentAmount { get; set; }
    public string LastPaymentCurrency { get; set; } = "GBP";
    public DateTime? LastPaymentAtUtc { get; set; }
    public DateTime? DeletionRequestedAtUtc { get; set; }

    /// <summary>Optional note from the student for their tutor (admin dashboard).</summary>
    public string? MessageToTutor { get; set; }
    public DateTime? MessageToTutorUpdatedAtUtc { get; set; }

    public StudentOnboardingProfile? Onboarding { get; set; }
}
