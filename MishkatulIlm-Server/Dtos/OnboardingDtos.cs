using System.ComponentModel.DataAnnotations;

namespace MishkatulIlm_Server.Dtos;

public sealed class SaveOnboardingRequest
{
    [Required, MaxLength(120)]
    public string FirstName { get; set; } = string.Empty;

    [Required, MaxLength(120)]
    public string LastName { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string AgeRange { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Gender { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string CurrentLevel { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string LessonFrequency { get; set; } = string.Empty;

    [Required]
    public List<string> SubjectCodes { get; set; } = new();
}
