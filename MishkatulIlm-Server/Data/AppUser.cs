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

    /// <summary>When true, the user may call admin APIs and open the admin dashboard.</summary>
    public bool IsAdmin { get; set; }

    public StudentOnboardingProfile? Onboarding { get; set; }
}
