using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using MishkatulIlm_Server.Options;
using MishkatulIlm_Server.Services;
using Stripe;
using Stripe.Checkout;

namespace MishkatulIlm_Server.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/webhooks/stripe")]
public sealed class StripeWebhookController(
    IOptions<StripeOptions> stripeOptions,
    StripePaymentRecorder paymentRecorder,
    ILogger<StripeWebhookController> logger) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Handle(CancellationToken cancellationToken)
    {
        var options = stripeOptions.Value;
        if (string.IsNullOrWhiteSpace(options.WebhookSecret))
        {
            logger.LogWarning("Stripe webhook received but Stripe:WebhookSecret is not configured.");
            return BadRequest(new { message = "Webhook is not configured." });
        }

        var json = await new StreamReader(HttpContext.Request.Body).ReadToEndAsync(cancellationToken);
        Event stripeEvent;
        try
        {
            var signature = Request.Headers["Stripe-Signature"].ToString();
            stripeEvent = EventUtility.ConstructEvent(json, signature, options.WebhookSecret);
        }
        catch (StripeException ex)
        {
            logger.LogWarning(ex, "Stripe webhook signature verification failed.");
            return BadRequest();
        }

        if (stripeEvent.Type == EventTypes.CheckoutSessionCompleted)
        {
            var session = stripeEvent.Data.Object as Session;
            if (session is not null)
                await paymentRecorder.TryRecordCheckoutSessionAsync(session, cancellationToken);
        }

        return Ok();
    }
}
