using Stripe;

namespace MishkatulIlm_Server.Services;

public static class StripeWebhookSignatureVerifier
{
    public static Event ConstructEvent(string payload, string signature, string secret) =>
        EventUtility.ConstructEvent(payload, signature, secret);
}
