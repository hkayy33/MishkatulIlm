namespace MishkatulIlm_Server.Dtos;

public sealed class SchedulingSettingsDto
{
    public string TutorDisplayName { get; init; } = "Tutor";
    public string TutorCountry { get; init; } = string.Empty;
    public string TutorCity { get; init; } = string.Empty;
    public string TutorTimeZoneId { get; init; } = "UTC";
}

public sealed class UpdateSchedulingSettingsRequest
{
    public string TutorDisplayName { get; set; } = "Tutor";
    public string TutorCountry { get; set; } = string.Empty;
    public string TutorCity { get; set; } = string.Empty;
    public string TutorTimeZoneId { get; set; } = "UTC";
}
