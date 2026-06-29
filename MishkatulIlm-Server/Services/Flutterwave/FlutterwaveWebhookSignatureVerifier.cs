using System.Security.Cryptography;
using System.Text;

namespace MishkatulIlm_Server.Services.Flutterwave;

public static class FlutterwaveWebhookSignatureVerifier
{
    /// <summary>
    /// v4 webhooks: HMAC-SHA256 of the raw body, base64-encoded, sent as flutterwave-signature.
    /// </summary>
    public static bool IsValidV4Signature(string rawBody, string? signatureHeader, string secretHash)
    {
        if (string.IsNullOrWhiteSpace(signatureHeader) || string.IsNullOrWhiteSpace(secretHash))
            return false;

        var computed = Convert.ToBase64String(
            HMACSHA256.HashData(Encoding.UTF8.GetBytes(secretHash), Encoding.UTF8.GetBytes(rawBody)));

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(computed),
            Encoding.UTF8.GetBytes(signatureHeader));
    }

    /// <summary>Legacy v3 webhooks: plain secret hash in verif-hash header.</summary>
    public static bool IsValidLegacyHash(string? verifHashHeader, string secretHash) =>
        !string.IsNullOrWhiteSpace(verifHashHeader)
        && CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(verifHashHeader),
            Encoding.UTF8.GetBytes(secretHash));
}
