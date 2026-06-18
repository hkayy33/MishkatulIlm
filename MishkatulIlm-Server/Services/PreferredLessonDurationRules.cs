namespace MishkatulIlm_Server.Services;

public static class PreferredLessonDurationRules
{
    public const string Min45 = "MIN-45";
    public const string Min60 = "MIN-60";

    private static readonly HashSet<string> Allowed = new(StringComparer.Ordinal)
    {
        Min45,
        Min60,
    };

    public static bool TryValidate(string preferredLessonDuration, out string? error)
    {
        error = null;
        var code = preferredLessonDuration.Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(code))
        {
            error = "Preferred lesson duration is required.";
            return false;
        }

        if (!Allowed.Contains(code))
        {
            error = "Choose 45 minutes or 1 hour.";
            return false;
        }

        return true;
    }

    public static int ToMinutes(string code) =>
        code.Trim().ToUpperInvariant() switch
        {
            Min45 => 45,
            Min60 => 60,
            _ => 60,
        };
}
