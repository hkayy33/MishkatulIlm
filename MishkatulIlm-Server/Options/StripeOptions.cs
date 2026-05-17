namespace MishkatulIlm_Server.Options;

public sealed class StripeOptions
{
    public const string SectionName = "Stripe";

    /// <summary>Stripe secret API key (sk_test_… or sk_live_…). Prefer user secrets in development.</summary>
    public string SecretKey { get; set; } = string.Empty;

    /// <summary>Webhook signing secret (whsec_…).</summary>
    public string WebhookSecret { get; set; } = string.Empty;

    /// <summary>Stripe product id (prod_…) for student subscriptions. Preferred when set.</summary>
    public string ProductId { get; set; } = string.Empty;

    /// <summary>Fallback price lookup key when <see cref="ProductId"/> is not set.</summary>
    public string PriceLookupKey { get; set; } = "student_lessons_monthly";

    /// <summary>Angular app origin used for Checkout success and cancel URLs.</summary>
    public string ClientAppUrl { get; set; } = "http://localhost:4200";

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(SecretKey)
        && (!string.IsNullOrWhiteSpace(ProductId) || !string.IsNullOrWhiteSpace(PriceLookupKey));
}
