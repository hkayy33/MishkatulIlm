namespace MishkatulIlm_Server.Options;

public sealed class FlutterwaveOptions
{
    public const string SectionName = "Flutterwave";

    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public string EncryptionKey { get; set; } = string.Empty;

    /// <summary>v3 Secret key (FLWSECK-...) for Standard hosted card checkout.</summary>
    public string SecretKey { get; set; } = string.Empty;

    /// <summary>Optional secret hash for webhook verification (verif-hash header).</summary>
    public string WebhookSecretHash { get; set; } = string.Empty;

    public string TokenUrl { get; set; } =
        "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";

    public string ApiBaseUrl { get; set; } = "https://developersandbox-api.flutterwave.com";

    public string StandardApiBaseUrl { get; set; } = "https://api.flutterwave.com";

    public string ClientAppUrl { get; set; } = "http://localhost:4200";

    /// <summary>
    /// LAN-accessible app URL for local dev when the browser uses localhost but Flutterwave
    /// rejects loopback redirect URLs on orchestrator/direct-charges (e.g. http://192.168.1.40:4200).
    /// </summary>
    public string LocalNetworkAppUrl { get; set; } = string.Empty;

    /// <summary>Optional HTTPS override when orchestrator fallback is needed and ClientAppUrl is not HTTPS.</summary>
    public string PaymentRedirectUrl { get; set; } = string.Empty;

    /// <summary>
    /// Optional override for hosted orchestrator methods (comma-separated, e.g. <c>applepay</c>).
    /// Bare <c>card</c> requires encrypted card fields and cannot be used for server-side redirect.
    /// </summary>
    public string OrchestratorPaymentMethod { get; set; } = string.Empty;

    public bool IsSandbox =>
        ApiBaseUrl.Contains("sandbox", StringComparison.OrdinalIgnoreCase);

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(ClientId) && !string.IsNullOrWhiteSpace(ClientSecret);

    public bool HasStandardHostedCheckout =>
        !string.IsNullOrWhiteSpace(SecretKey);

    public bool CanAcceptPayments =>
        IsConfigured || HasStandardHostedCheckout;
}
