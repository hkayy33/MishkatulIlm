using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MishkatulIlm_Server.Dtos;
using MishkatulIlm_Server.Services;

namespace MishkatulIlm_Server.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/auth")]
public sealed class AuthController(SupabaseAdminAuthClient supabaseAdmin) : ControllerBase
{
    /// <summary>
    /// Verifies a signup confirmation link (<c>token_hash</c> from the email template).
    /// Used when browser-side Supabase client verification fails (wrong keys, CORS, etc.).
    /// </summary>
    [HttpPost("verify-email-callback")]
    public async Task<IActionResult> VerifyEmailCallback(
        [FromBody] VerifyEmailCallbackRequest request,
        CancellationToken cancellationToken)
    {
        if (!supabaseAdmin.IsConfigured)
        {
            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                new { message = "Auth is not configured on the server." });
        }

        var hash = request.TokenHash.Trim();
        if (hash.Length == 0)
            return BadRequest(new { message = "Missing token_hash." });

        var typesToTry = new List<string>();
        var requested = string.IsNullOrWhiteSpace(request.Type) ? "email" : request.Type.Trim();
        typesToTry.Add(requested);
        if (string.Equals(requested, "recovery", StringComparison.OrdinalIgnoreCase))
        {
            // Recovery links must not fall through to signup/email OTP types.
        }
        else
        {
            if (!string.Equals(requested, "email", StringComparison.OrdinalIgnoreCase))
                typesToTry.Add("email");
            if (!string.Equals(requested, "signup", StringComparison.OrdinalIgnoreCase))
                typesToTry.Add("signup");
        }

        SupabaseVerifyResponse? verified = null;
        string? lastError = null;

        foreach (var type in typesToTry.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var (result, error) = await supabaseAdmin.VerifyTokenHashAsync(hash, type, cancellationToken);
            if (result is not null)
            {
                verified = result;
                break;
            }

            lastError = error;
        }

        if (verified is null)
        {
            return BadRequest(new { message = lastError ?? "Email confirmation link is invalid or expired." });
        }

        return Ok(
            new VerifyEmailCallbackResponse
            {
                AccessToken = verified.AccessToken ?? string.Empty,
                RefreshToken = verified.RefreshToken ?? string.Empty,
                UserId = verified.User?.Id.ToString() ?? string.Empty,
                Email = verified.User?.Email ?? string.Empty,
            });
    }
}
