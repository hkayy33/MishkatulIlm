using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using MishkatulIlm_Server.Services.Flutterwave;

namespace MishkatulIlm_Server.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/webhooks/flutterwave")]
public sealed class FlutterwaveWebhookController(
    FlutterwavePaymentService paymentService,
    IConfiguration configuration,
    ILogger<FlutterwaveWebhookController> logger) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Handle(CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(Request.Body);
        var body = await reader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(body))
            return BadRequest();

        var secretHash = configuration["Flutterwave:WebhookSecretHash"];
        if (!string.IsNullOrWhiteSpace(secretHash))
        {
            var v4Signature = Request.Headers["flutterwave-signature"].ToString();
            var legacyHash = Request.Headers["verif-hash"].ToString();
            var valid = FlutterwaveWebhookSignatureVerifier.IsValidV4Signature(body, v4Signature, secretHash)
                || FlutterwaveWebhookSignatureVerifier.IsValidLegacyHash(legacyHash, secretHash);

            if (!valid)
            {
                logger.LogWarning("Flutterwave webhook rejected due to invalid signature.");
                return Unauthorized();
            }
        }

        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(body);
        }
        catch (JsonException ex)
        {
            logger.LogWarning(ex, "Flutterwave webhook payload was not valid JSON.");
            return BadRequest();
        }

        using (doc)
        {
            var root = doc.RootElement;
            var eventType = root.TryGetProperty("event", out var eventEl)
                ? eventEl.GetString()
                : root.TryGetProperty("type", out var typeEl) ? typeEl.GetString() : null;

            if (!string.Equals(eventType, "charge.completed", StringComparison.OrdinalIgnoreCase))
                return Ok(new { message = "Ignored." });

            if (!root.TryGetProperty("data", out var data))
                return BadRequest();

            var reference = data.TryGetProperty("reference", out var refEl)
                ? refEl.GetString()
                : data.TryGetProperty("tx_ref", out var txRefEl) ? txRefEl.GetString() : null;
            var chargeId = data.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
            var amount = data.TryGetProperty("amount", out var amountEl) ? amountEl.GetDecimal() : 0m;
            var currency = data.TryGetProperty("currency", out var currencyEl) ? currencyEl.GetString() ?? "USD" : "USD";
            var status = data.TryGetProperty("status", out var statusEl) ? statusEl.GetString() : null;

            if (string.IsNullOrWhiteSpace(reference) || string.IsNullOrWhiteSpace(chargeId))
                return BadRequest();

            if (!string.Equals(status, "successful", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(status, "succeeded", StringComparison.OrdinalIgnoreCase))
                return Ok(new { message = "Charge not successful." });

            var (success, error, _) = await paymentService.TryCompleteFromWebhookAsync(
                reference,
                chargeId,
                amount,
                currency,
                cancellationToken);

            if (!success)
            {
                logger.LogWarning("Flutterwave webhook could not complete payment {Reference}: {Error}", reference, error);
                return Ok(new { message = error });
            }

            return Ok(new { message = "Payment recorded." });
        }
    }
}
