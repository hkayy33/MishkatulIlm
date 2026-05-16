namespace MishkatulIlm_Server.Services;

public static class LessonFrequencyRules
{
    private static readonly string[] Ranked =
    [
        "BIWEEKLY",
        "ONCE-WEEK",
        "TWICE-WEEK",
        "THREE-WEEK",
        "FOUR-PLUS-WEEK",
    ];

    public static bool TryValidate(string lessonFrequency, int subjectCount, out string? error)
    {
        error = null;
        var code = lessonFrequency.Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(code))
        {
            error = "Lesson frequency is required.";
            return false;
        }

        if (subjectCount != 3)
            return IsKnownFrequency(code);

        if (code == "FLEXIBLE")
        {
            error = "Flexible frequency is not available when three subjects are selected.";
            return false;
        }

        if (code is "TWICE-WEEK" or "THREE-WEEK")
            return true;

        error = "With 3 subjects, choose twice or three times per week.";
        return false;
    }

    private static bool IsKnownFrequency(string code) =>
        RankOf(code) is not null || code == "FLEXIBLE";

    private static int? RankOf(string code)
    {
        for (var i = 0; i < Ranked.Length; i++)
        {
            if (Ranked[i] == code)
                return i;
        }

        return null;
    }
}
