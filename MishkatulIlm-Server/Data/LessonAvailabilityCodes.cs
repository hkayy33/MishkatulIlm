namespace MishkatulIlm_Server.Data;

/// <summary>Valid day/time codes for preferred lesson availability (stored as DAY-SLOT in jsonb).</summary>
public static class LessonAvailabilityCodes
{
    public static readonly HashSet<string> Days =
        new(StringComparer.OrdinalIgnoreCase) { "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN" };

    public static readonly HashSet<string> TimeSlots =
        new(StringComparer.OrdinalIgnoreCase) { "MORNING", "AFTERNOON", "EVENING" };

    public static bool TryNormalize(IEnumerable<string>? raw, out List<string> normalized, out string? errorMessage)
    {
        normalized = [];
        if (raw is null)
        {
            errorMessage = "Select at least one preferred lesson time.";
            return false;
        }

        foreach (var item in raw)
        {
            if (string.IsNullOrWhiteSpace(item))
                continue;

            var parts = item.Trim().Split('-', 2, StringSplitOptions.TrimEntries);
            if (parts.Length != 2)
            {
                errorMessage = "Invalid availability selection.";
                return false;
            }

            var day = parts[0].ToUpperInvariant();
            var slot = parts[1].ToUpperInvariant();
            if (!Days.Contains(day) || !TimeSlots.Contains(slot))
            {
                errorMessage = "Invalid availability selection.";
                return false;
            }

            var code = $"{day}-{slot}";
            if (!normalized.Contains(code, StringComparer.Ordinal))
                normalized.Add(code);
        }

        if (normalized.Count == 0)
        {
            errorMessage = "Select at least one preferred lesson time.";
            return false;
        }

        errorMessage = null;
        return true;
    }
}
