namespace MishkatulIlm_Server.Data;

/// <summary>Open lesson slot created by an admin; booked when a student is approved.</summary>
public sealed class LessonSlot
{
    public Guid Id { get; set; }
    public DateTime StartsAtUtc { get; set; }
    public DateTime EndsAtUtc { get; set; }
    public Guid? StudentUserId { get; set; }
    public AppUser? Student { get; set; }
    public string AttendanceStatus { get; set; } = AttendanceStatusCodes.Attending;
    /// <summary>Optional note from the student for this lesson (visible to tutor).</summary>
    public string? StudentNote { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
