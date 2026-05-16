namespace MishkatulIlm_Server.Data;

public static class ApplicationStatusCodes
{
    public const string Pending = "PENDING";
    public const string AwaitingReply = "AWAITING_REPLY";
    public const string Active = "ACTIVE";
    public const string Inactive = "INACTIVE";

    public static bool IsPendingQueue(string status) =>
        status is Pending or AwaitingReply;

    public static bool TryNormalize(string? value, out string normalized, out string? error)
    {
        normalized = Pending;
        error = null;
        if (string.IsNullOrWhiteSpace(value))
            return true;

        var key = value.Trim().ToUpperInvariant() switch
        {
            "PENDING" => Pending,
            "AWAITING_REPLY" => AwaitingReply,
            "ACTIVE" => Active,
            "INACTIVE" => Inactive,
            _ => null,
        };

        if (key is null)
        {
            error = "Status must be pending, awaiting_reply, active, or inactive.";
            return false;
        }

        normalized = key;
        return true;
    }

    public static string ToApiValue(string stored) =>
        stored.Trim().ToUpperInvariant() switch
        {
            Active => "active",
            Inactive => "inactive",
            AwaitingReply => "awaiting_reply",
            _ => "pending",
        };
}
