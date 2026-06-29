using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Authentication;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;
using MishkatulIlm_Server.Services;
using MishkatulIlm_Server.Services.Flutterwave;

namespace MishkatulIlm_Server.Controllers;

[ApiController]
[Authorize]
[Route("api/student")]
public sealed class StudentPaymentController(
    AppDbContext db,
    StudentPaymentService paymentService,
    LessonBillingContextService billingContext) : ControllerBase
{
    [HttpGet("payment-statement")]
    public async Task<IActionResult> GetPaymentStatement(CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        var user = await db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);
        if (user is null)
            return NotFound(new { message = "Account not found." });

        if (user.ApplicationStatus != ApplicationStatusCodes.Active)
        {
            return BadRequest(
                new { message = "Payments are available after you accept your lesson schedule." });
        }

        var statement = await paymentService.GetStatementAsync(userId, cancellationToken);
        if (statement is null)
        {
            var submission = await paymentService.GetCurrentSubmissionAsync(userId, cancellationToken);
            var billing = await billingContext.ResolveAsync(user, DateTime.UtcNow, cancellationToken);
            var summary = StudentPaymentSummaryBuilder.Build(user, submission, DateTime.UtcNow, billing);
            if (!summary.ShowPaymentDetails)
            {
                var dueMessage = summary.NextPaymentDueUtc is null
                    ? "Next payment is not scheduled yet."
                    : $"Next payment is due on {summary.NextPaymentDueUtc.Value:MMMM d, yyyy}.";

                return BadRequest(new { message = dueMessage });
            }

            return NotFound(new { message = "Account not found." });
        }

        return Ok(statement);
    }

    [HttpPost("payment-submission")]
    public async Task<IActionResult> SubmitPayment(CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        var (success, error, submission) = await paymentService.SubmitPaymentAsync(userId, cancellationToken);
        if (!success)
            return BadRequest(new { message = error });

        return Ok(new
        {
            message = "Payment submitted. We will verify it shortly.",
            submissionId = submission!.Id,
            status = submission.Status,
        });
    }

    [HttpPost("flutterwave-checkout")]
    public async Task<IActionResult> CreateFlutterwaveCheckout(
        FlutterwavePaymentService flutterwavePayments,
        CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        var (success, error, checkoutUrl, submission) =
            await flutterwavePayments.InitiateCheckoutAsync(userId, cancellationToken);
        if (!success)
            return BadRequest(new { message = error });

        return Ok(new
        {
            checkoutUrl,
            link = checkoutUrl,
            reference = submission!.PaymentReference,
            submissionId = submission.Id,
            status = submission.Status,
        });
    }

    [HttpPost("flutterwave-verify")]
    public async Task<IActionResult> VerifyFlutterwavePayment(
        [FromBody] VerifyFlutterwavePaymentRequest request,
        FlutterwavePaymentService flutterwavePayments,
        CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        var (success, error, message) = await flutterwavePayments.TryCompleteByReferenceAsync(
            userId,
            request.Reference,
            request.TransactionId,
            cancellationToken);
        if (!success)
            return BadRequest(new { message = error });

        return Ok(new { message });
    }

    [HttpGet("payment-history")]
    public async Task<IActionResult> GetPaymentHistory(CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        var user = await db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);
        if (user is null)
            return NotFound(new { message = "Account not found." });

        var history = await paymentService.GetPaymentHistoryAsync(userId, cancellationToken);
        return Ok(history);
    }
}
