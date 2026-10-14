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
    StripeStatementPaymentService statementPayments,
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
            stripeEvent = StripeWebhookSignatureVerifier.ConstructEvent(json, signature, options.WebhookSecret);
        }
        catch (StripeException ex)
        {
            logger.LogWarning(ex, "Stripe webhook signature verification failed.");
            return BadRequest();
        }

        StripeConfiguration.ApiKey = options.SecretKey;

        switch (stripeEvent.Type)
        {
            case EventTypes.CheckoutSessionCompleted:
            case "checkout.session.async_payment_succeeded":
                if (stripeEvent.Data.Object is Session checkoutSession)
                {
                    if (checkoutSession.Mode == "payment")
                    {
                        var recorded = await statementPayments.TryRecordPaidSessionAsync(checkoutSession, cancellationToken);
                        if (!recorded && string.Equals(checkoutSession.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase))
                            return StatusCode(StatusCodes.Status500InternalServerError);
                    }
                    else
                        await paymentRecorder.TryRecordCheckoutSessionAsync(checkoutSession, cancellationToken);
                }
                break;

            case EventTypes.InvoicePaid:
                if (stripeEvent.Data.Object is Invoice invoice)
                    await paymentRecorder.TryRecordInvoicePaidAsync(invoice, cancellationToken);
                break;

            case EventTypes.CustomerSubscriptionUpdated:
            case EventTypes.CustomerSubscriptionDeleted:
                if (stripeEvent.Data.Object is Subscription subscription)
                    await paymentRecorder.TrySyncSubscriptionAsync(subscription, cancellationToken);
                break;
        }

        return Ok();
    }
}
