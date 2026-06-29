namespace MishkatulIlm_Server.Options;

public sealed class FlutterwaveOptions
{
    public const string SectionName = "Flutterwave";

    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public string EncryptionKey { get; set; } = string.Empty;

    /// <summary>Optional secret hash for webhook verification (verif-hash header).</summary>
    public string WebhookSecretHash { get; set; } = string.Empty;

    public string TokenUrl { get; set; } =
        "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";

    public string ApiBaseUrl { get; set; } = "https://developersandbox-api.flutterwave.com";

    public string ClientAppUrl { get; set; } = "http://localhost:4200";

    /// <summary>
    /// Optional HTTPS return URL for hosted Flutterwave redirects (orchestrator fallback).
    /// Required for local dev when checkout sessions do not return checkout_url.
    /// </summary>
    public string PaymentRedirectUrl { get; set; } = string.Empty;

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(ClientId) && !string.IsNullOrWhiteSpace(ClientSecret);
}
