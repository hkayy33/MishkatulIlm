namespace MishkatulIlm_Server.Data;

public sealed class ScheduleChangeRequest
{
    public Guid Id { get; set; }
    public Guid StudentUserId { get; set; }
    public AppUser Student { get; set; } = null!;
    public string Note { get; set; } = string.Empty;
    public string Status { get; set; } = ScheduleChangeRequestCodes.Pending;
    public DateTime CreatedAtUtc { get; set; }
}

public static class ScheduleChangeRequestCodes
{
    public const string Pending = "PENDING";
    public const string Resolved = "RESOLVED";
}
