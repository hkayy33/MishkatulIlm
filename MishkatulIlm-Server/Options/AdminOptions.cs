namespace MishkatulIlm_Server.Options;

public sealed class AdminOptions
{
    public const string SectionName = "Admin";

    /// <summary>Comma-separated emails that receive <see cref="Data.AppUser.IsAdmin"/> on sync (case-insensitive).</summary>
    public string PromotedAdminEmails { get; set; } = string.Empty;

    public bool IsPromotedAdminEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email))
            return false;

        var normalized = email.Trim().ToLowerInvariant();
        foreach (var part in PromotedAdminEmails.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (string.Equals(part.Trim(), normalized, StringComparison.OrdinalIgnoreCase))
                return true;
        }

        return false;
    }
}
