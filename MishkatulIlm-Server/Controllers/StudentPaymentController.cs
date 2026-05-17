using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MishkatulIlm_Server.Authentication;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;
using MishkatulIlm_Server.Options;
using MishkatulIlm_Server.Services;
using Stripe;
using Stripe.Checkout;

namespace MishkatulIlm_Server.Controllers;

[ApiController]
[Authorize]
[Route("api/student")]
public sealed class StudentPaymentController(
    AppDbContext db,
    IOptions<StripeOptions> stripeOptions,
    StripePaymentRecorder paymentRecorder,
    StripeSubscriptionService subscriptionService,
    StripeCheckoutPriceResolver priceResolver) : ControllerBase
{
    [HttpPost("checkout-session")]
    public async Task<IActionResult> CreateCheckoutSession(CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        var options = stripeOptions.Value;
        if (!options.IsConfigured)
        {
            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                new { message = "Online payments are not configured yet. Please contact support." });
        }

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);
        if (user is null)
            return NotFound(new { message = "Account not found." });

        if (user.ApplicationStatus != ApplicationStatusCodes.Active)
        {
            return BadRequest(
                new { message = "Payments are available after you accept your lesson schedule." });
        }

        var payment = StudentPaymentSummaryBuilder.Build(user);
        if (!payment.CanMakePayment)
        {
            return BadRequest(new
            {
                message = payment.HasActiveSubscription
                    ? "You already have an active monthly subscription."
                    : "Online payment is not required right now.",
            });
        }

        var (priceId, priceError) = await priceResolver.ResolvePriceIdAsync(cancellationToken);
        if (priceId is null)
        {
            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                new { message = priceError ?? "Could not resolve Stripe price." });
        }

        StripeConfiguration.ApiKey = options.SecretKey;
        var clientBase = options.ClientAppUrl.Trim().TrimEnd('/');
        var sessionService = new SessionService();
        var sessionOptions = new SessionCreateOptions
            {
                Mode = "subscription",
                ClientReferenceId = userId.ToString(),
                Metadata = new Dictionary<string, string> { ["user_id"] = userId.ToString() },
                LineItems =
                [
                    new SessionLineItemOptions
                    {
                        Price = priceId,
                        Quantity = 1,
                    },
                ],
                SuccessUrl = $"{clientBase}/dashboard?payment=success&session_id={{CHECKOUT_SESSION_ID}}",
                CancelUrl = $"{clientBase}/dashboard?payment=cancelled",
            };

        if (!string.IsNullOrWhiteSpace(user.StripeCustomerId))
            sessionOptions.Customer = user.StripeCustomerId;
        else
            sessionOptions.CustomerEmail = user.Email;

        var session = await sessionService.CreateAsync(sessionOptions, cancellationToken: cancellationToken);

        if (string.IsNullOrWhiteSpace(session.Url))
            return StatusCode(StatusCodes.Status502BadGateway, new { message = "Could not start checkout." });

        return Ok(new { url = session.Url });
    }

    [HttpPost("confirm-payment")]
    public async Task<IActionResult> ConfirmPayment(
        [FromBody] ConfirmCheckoutPaymentRequest request,
        CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        var options = stripeOptions.Value;
        if (!options.IsConfigured)
        {
            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                new { message = "Online payments are not configured yet." });
        }

        var sessionId = request.SessionId.Trim();
        if (sessionId.Length == 0)
            return BadRequest(new { message = "Missing checkout session id." });

        StripeConfiguration.ApiKey = options.SecretKey;
        var session = await new SessionService().GetAsync(sessionId, cancellationToken: cancellationToken);

        if (!session.Metadata.TryGetValue("user_id", out var ownerRaw))
            ownerRaw = session.ClientReferenceId;

        if (!Guid.TryParse(ownerRaw, out var ownerId) || ownerId != userId)
            return Forbid();

        var recorded = await paymentRecorder.TryRecordCheckoutSessionAsync(session, cancellationToken);
        if (!recorded)
        {
            return BadRequest(
                new { message = "Payment is not complete yet. Refresh in a moment or contact support." });
        }

        return Ok(new { message = "Payment recorded. Thank you!" });
    }

    [HttpPost("cancel-subscription")]
    public async Task<IActionResult> CancelSubscription(CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        var (success, error, periodEndUtc) =
            await subscriptionService.CancelAtPeriodEndAsync(userId, cancellationToken);

        if (!success)
            return BadRequest(new { message = error });

        return Ok(new
        {
            message = periodEndUtc is null
                ? "Your monthly payments have been cancelled."
                : $"Your subscription will end on {periodEndUtc:MMMM d, yyyy}. You can keep using lessons until then.",
            subscriptionCurrentPeriodEndUtc = periodEndUtc,
        });
    }
}
