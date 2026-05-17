using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MishkatulIlm_Server.Authentication;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;
using MishkatulIlm_Server.Options;
using MishkatulIlm_Server.Services;

namespace MishkatulIlm_Server.Controllers;

/// <summary>
/// App profile for the signed-in Supabase user. Rows are created by the <c>auth.users</c> DB trigger at signup;
/// <see cref="Sync"/> backfills if needed and applies admin promotion from config.
/// </summary>
[ApiController]
[Authorize]
[Route("api/[controller]")]
public sealed class UsersController(
    AppDbContext db,
    IOptions<AdminOptions> adminOptions,
    ILogger<UsersController> logger) : ControllerBase
{
    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        var email =
            User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Email)
            ?? User.FindFirstValue("email")
            ?? string.Empty;

        var (metaFirst, metaLast) = ReadNamesFromUserMetadataClaim();

        var row = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (row is null)
        {
            return Ok(
                new UserMeResponse
                {
                    UserId = userId,
                    Email = email,
                    FirstName = metaFirst,
                    LastName = metaLast,
                    OnboardingCompleted = false,
                    IsAdmin = adminOptions.Value.IsPromotedAdminEmail(email),
                });
        }

        return Ok(
            new UserMeResponse
            {
                UserId = row.Id,
                Email = row.Email,
                FirstName = row.FirstName,
                LastName = row.LastName,
                OnboardingCompleted = row.OnboardingCompleted,
                IsAdmin = row.IsAdmin,
            });
    }

    [HttpPost("sync")]
    public async Task<IActionResult> Sync(CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
        {
            logger.LogWarning(
                "User sync: could not parse user id from JWT. Claim types present: {ClaimTypes}",
                string.Join(", ", User.Claims.Select(static c => c.Type).Distinct()));
            return Unauthorized();
        }

        var email =
            User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Email)
            ?? User.FindFirstValue("email")
            ?? string.Empty;

        if (string.IsNullOrWhiteSpace(email))
            email = $"{userId:N}@supabase-sync.local";

        var (firstName, lastName) = ReadNamesFromUserMetadataClaim();
        var promoted = adminOptions.Value.IsPromotedAdminEmail(email);

        try
        {
            await UserProfileProvisioner.EnsureAsync(
                db,
                userId,
                email,
                firstName,
                lastName,
                promoted,
                onboardingCompleted: null,
                cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            logger.LogWarning(ex, "User sync: could not ensure profile for {UserId}", userId);
            return Conflict(new { message = "User profile could not be created." });
        }

        return NoContent();
    }

    private (string FirstName, string LastName) ReadNamesFromUserMetadataClaim()
    {
        var raw =
            User.FindFirst("user_metadata")?.Value
            ?? User.FindFirst("https://supabase.com/user_metadata")?.Value;

        if (string.IsNullOrWhiteSpace(raw))
            return (string.Empty, string.Empty);

        try
        {
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            var fn = root.TryGetProperty("first_name", out var f) ? (f.GetString() ?? string.Empty) : string.Empty;
            var ln = root.TryGetProperty("last_name", out var l) ? (l.GetString() ?? string.Empty) : string.Empty;
            return (fn.Trim(), ln.Trim());
        }
        catch
        {
            return (string.Empty, string.Empty);
        }
    }
}
