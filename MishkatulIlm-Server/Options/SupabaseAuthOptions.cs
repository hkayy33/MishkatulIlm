namespace MishkatulIlm_Server.Options;

public sealed class SupabaseAuthOptions
{
    public const string SectionName = "Supabase";

    /// <summary>Project URL, e.g. https://abcd.supabase.co</summary>
    public string Url { get; set; } = string.Empty;

    /// <summary>
    /// Legacy JWT Secret (HS256) from Dashboard → JWT Keys → Legacy JWT Secret.
    /// Only needed while some access tokens are still signed with HS256. ECC (ES256) tokens use JWKS automatically.
    /// </summary>
    public string JwtSecret { get; set; } = string.Empty;
}
