using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Authentication;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;
using MishkatulIlm_Server.Services;

namespace MishkatulIlm_Server.Controllers;

[ApiController]
[Authorize]
[Route("api/admin/payment-submissions")]
public sealed class AdminPaymentSubmissionsController(
    AppDbContext db,
    AdminPaymentSubmissionService paymentSubmissions) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? status,
        CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        var items = await paymentSubmissions.ListAsync(status, cancellationToken);
        return Ok(items);
    }

    [HttpPost("{submissionId:guid}/approve")]
    public async Task<IActionResult> Approve(
        Guid submissionId,
        [FromBody] ReviewPaymentSubmissionRequest request,
        CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var adminUserId))
            return Unauthorized();

        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        var (success, error) = await paymentSubmissions.ApproveAsync(
            submissionId,
            adminUserId,
            request.AdminNote,
            cancellationToken);

        if (!success)
            return BadRequest(new { message = error });

        return Ok(new { message = "Payment marked as paid." });
    }

    [HttpPost("{submissionId:guid}/reject")]
    public async Task<IActionResult> Reject(
        Guid submissionId,
        [FromBody] ReviewPaymentSubmissionRequest request,
        CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var adminUserId))
            return Unauthorized();

        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        var (success, error) = await paymentSubmissions.RejectAsync(
            submissionId,
            adminUserId,
            request.AdminNote,
            cancellationToken);

        if (!success)
            return BadRequest(new { message = error });

        return Ok(new { message = "Payment submission rejected." });
    }

    private async Task<bool> IsCurrentUserAdminAsync(CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return false;

        return await db.Users.AsNoTracking().AnyAsync(u => u.Id == userId && u.IsAdmin, cancellationToken);
    }
}
