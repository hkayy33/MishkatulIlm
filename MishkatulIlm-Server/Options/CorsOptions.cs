namespace MishkatulIlm_Server.Options;

public sealed class CorsOptions
{
    public const string SectionName = "Cors";

    /// <summary>Origins allowed to call the API (e.g. https://app.example.com).</summary>
    public string[] AllowedOrigins { get; set; } = [];
}
