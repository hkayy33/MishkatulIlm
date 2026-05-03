namespace MishkatulIlm_Server.Data;

public sealed class StudentOnboardingProfile
{
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;

    public string AgeRange { get; set; } = string.Empty;
    public string Gender { get; set; } = string.Empty;
    public string CurrentLevel { get; set; } = string.Empty;
    public string LessonFrequency { get; set; } = string.Empty;

    /// <summary>Stored as JSON array in PostgreSQL (jsonb).</summary>
    public List<string> SubjectCodes { get; set; } = new();
}
