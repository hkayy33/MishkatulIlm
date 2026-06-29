using System.Security.Cryptography;
using System.Text;
using MishkatulIlm_Server.Services.Flutterwave;
using Xunit;

namespace MishkatulIlm_Server.Tests;

public sealed class FlutterwaveWebhookSignatureVerifierTests
{
    private const string Secret = "test-webhook-secret";

    [Fact]
    public void IsValidV4Signature_accepts_matching_hmac()
    {
        const string body = """{"event":"charge.completed","data":{"id":"chg_1"}}""";
        var signature = Convert.ToBase64String(
            HMACSHA256.HashData(Encoding.UTF8.GetBytes(Secret), Encoding.UTF8.GetBytes(body)));

        Assert.True(FlutterwaveWebhookSignatureVerifier.IsValidV4Signature(body, signature, Secret));
    }

    [Fact]
    public void IsValidV4Signature_rejects_tampered_body()
    {
        const string body = """{"event":"charge.completed","data":{"id":"chg_1"}}""";
        var signature = Convert.ToBase64String(
            HMACSHA256.HashData(Encoding.UTF8.GetBytes(Secret), Encoding.UTF8.GetBytes(body)));

        Assert.False(FlutterwaveWebhookSignatureVerifier.IsValidV4Signature(body + " ", signature, Secret));
    }

    [Fact]
    public void IsValidLegacyHash_accepts_exact_secret_match()
    {
        Assert.True(FlutterwaveWebhookSignatureVerifier.IsValidLegacyHash(Secret, Secret));
    }

    [Fact]
    public void IsValidLegacyHash_rejects_wrong_hash()
    {
        Assert.False(FlutterwaveWebhookSignatureVerifier.IsValidLegacyHash("wrong", Secret));
    }
}
