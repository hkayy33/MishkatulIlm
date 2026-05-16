namespace MishkatulIlm_Server.Data;

public static class AttendanceStatusCodes
{
    public const string Attending = "ATTENDING";
    public const string NotAttending = "NOT_ATTENDING";

    public static bool TryNormalize(string? value, out string normalized, out string? error)
    {
        normalized = Attending;
        error = null;
        if (string.IsNullOrWhiteSpace(value))
            return true;

        var key = value.Trim().ToUpperInvariant() switch
        {
            "ATTENDING" or "ATTEND" => Attending,
            "NOT_ATTENDING" or "NOTATTENDING" or "ABSENT" => NotAttending,
            _ => null,
        };

        if (key is null)
        {
            error = "Attendance must be attending or not_attending.";
            return false;
        }

        normalized = key;
        return true;
    }

    public static string ToApiValue(string stored) =>
        stored.Trim().ToUpperInvariant() == NotAttending ? "not_attending" : "attending";
}
