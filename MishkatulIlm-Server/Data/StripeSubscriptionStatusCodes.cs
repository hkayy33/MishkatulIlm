namespace MishkatulIlm_Server.Data;

public static class StripeSubscriptionStatusCodes
{
    public const string Active = "active";
    public const string Trialing = "trialing";
    public const string PastDue = "past_due";
    public const string Canceled = "canceled";
    public const string Unpaid = "unpaid";
    public const string Incomplete = "incomplete";
    public const string IncompleteExpired = "incomplete_expired";
    public const string Paused = "paused";

    public static bool IsBillable(string? status) =>
        string.Equals(status, Active, StringComparison.OrdinalIgnoreCase)
        || string.Equals(status, Trialing, StringComparison.OrdinalIgnoreCase);

    public static bool IsPastDue(string? status) =>
        string.Equals(status, PastDue, StringComparison.OrdinalIgnoreCase)
        || string.Equals(status, Unpaid, StringComparison.OrdinalIgnoreCase);
}
