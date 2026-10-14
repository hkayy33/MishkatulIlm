using System.Security.Cryptography;
using System.Text;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;
using MishkatulIlm_Server.Services;
using Stripe;
using Xunit;

namespace MishkatulIlm_Server.Tests;

public sealed class StripeStatementPaymentTests
{
    [Theory]
    [InlineData(5, "USD", true)]
    [InlineData(168, "usd", true)]
    [InlineData(0, "USD", false)]
    [InlineData(-5, "USD", false)]
    [InlineData(5.001, "USD", false)]
    [InlineData(5, "GBP", false)]
    [InlineData(5, null, false)]
    public void Statement_amount_and_currency_are_validated(decimal amount, string? currency, bool expected) =>
        Assert.Equal(expected, StripeStatementPaymentService.IsValidStatementAmount(amount, currency));

    [Fact]
    public void Webhook_signature_accepts_matching_payload_and_rejects_tampering()
    {
        const string secret = "whsec_test_secret";
        const string payload = """{"id":"evt_test","object":"event","api_version":"2026-04-22.dahlia","created":1740000000,"data":{"object":{}},"livemode":false,"pending_webhooks":1,"type":"checkout.session.completed"}""";
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var signedPayload = $"{timestamp}.{payload}";
        var signature = Convert.ToHexString(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(signedPayload))).ToLowerInvariant();
        var header = $"t={timestamp},v1={signature}";

        Assert.Equal("evt_test", StripeWebhookSignatureVerifier.ConstructEvent(payload, header, secret).Id);
        Assert.Throws<StripeException>(() => StripeWebhookSignatureVerifier.ConstructEvent(payload + " ", header, secret));
    }

    [Fact]
    public void Paid_submission_is_not_eligible_for_a_second_recording()
    {
        var submission = new PaymentSubmission { Status = PaymentSubmissionStatusCodes.Paid };
        Assert.True(StripeStatementPaymentService.IsAlreadyPaid(submission));
        submission.Status = PaymentSubmissionStatusCodes.PendingVerification;
        Assert.False(StripeStatementPaymentService.IsAlreadyPaid(submission));
    }

    [Fact]
    public void Checkout_session_uses_server_statement_lines_and_one_time_usd_mode()
    {
        var userId = Guid.NewGuid();
        var submission = new PaymentSubmission
        {
            Id = Guid.NewGuid(),
            PaymentReference = "stmt_test",
            Amount = 12,
            Currency = "USD",
        };
        var statement = new PaymentStatementDto
        {
            BillingYear = 2026,
            BillingMonth = 10,
            Currency = "USD",
            TotalAmount = 12,
            Lessons =
            [
                new PaymentLessonLineItemDto { DurationMinutes = 45, LessonRate = 5, Amount = 5, RateLabel = "$5 per lesson" },
                new PaymentLessonLineItemDto { DurationMinutes = 60, LessonRate = 7, Amount = 7, RateLabel = "$7 per lesson" },
            ],
        };

        var options = StripeStatementPaymentService.BuildSessionOptions(
            userId, "student@example.test", submission, statement, "https://academy.example");

        Assert.Equal("payment", options.Mode);
        Assert.Equal(2, options.LineItems.Count);
        Assert.Equal(500, options.LineItems[0].PriceData.UnitAmount);
        Assert.Equal(700, options.LineItems[1].PriceData.UnitAmount);
        Assert.Equal("1200", options.Metadata["amount_minor"]);
        Assert.Equal("USD", options.Metadata["currency"]);
        Assert.Contains("https://academy.example/dashboard?payment=stripe-success", options.SuccessUrl);
        Assert.Equal("https://academy.example/dashboard?payment=stripe-cancelled", options.CancelUrl);
    }
}
