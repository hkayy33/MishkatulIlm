namespace MishkatulIlm_Server.Data;

/// <summary>Singleton tutor/scheduling display settings (row id = 1).</summary>
public sealed class SchedulingSettings
{
    public int Id { get; set; } = 1;

    public string TutorDisplayName { get; set; } = "Tutor";

    public string TutorCountry { get; set; } = string.Empty;

    public string TutorCity { get; set; } = string.Empty;

    /// <summary>IANA time zone id (e.g. Europe/London).</summary>
    public string TutorTimeZoneId { get; set; } = "UTC";

    public DateTime UpdatedAtUtc { get; set; }
}
