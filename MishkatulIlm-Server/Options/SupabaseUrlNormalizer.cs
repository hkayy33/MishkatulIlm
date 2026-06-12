namespace MishkatulIlm_Server.Options;

internal static class SupabaseUrlNormalizer
{
    /// <summary>
    /// Project root only — strips common mistaken suffixes from Dashboard copy-paste
    /// (e.g. <c>/rest/v1</c> API URL or <c>/auth/v1</c>).
    /// </summary>
    public static string NormalizeProjectUrl(string? raw)
    {
        var url = raw?.Trim().TrimEnd('/') ?? string.Empty;
        if (string.IsNullOrEmpty(url))
            return url;

        if (url.EndsWith("/auth/v1", StringComparison.OrdinalIgnoreCase))
            url = url[..^"/auth/v1".Length].TrimEnd('/');

        if (url.EndsWith("/rest/v1", StringComparison.OrdinalIgnoreCase))
            url = url[..^"/rest/v1".Length].TrimEnd('/');

        return url;
    }
}
