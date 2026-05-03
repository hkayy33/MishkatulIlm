using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;

namespace MishkatulIlm_Server.Controllers;

/// <summary>Ensures a <c>users</c> row exists for the current Supabase user (register/login hit Supabase first; this syncs your API DB).</summary>
[ApiController]
[Authorize]
[Route("api/[controller]")]
public sealed class UsersController(AppDbContext db, ILogger<UsersController> logger) : ControllerBase
{
    [HttpPost("sync")]
    public async Task<IActionResult> Sync(CancellationToken cancellationToken)
    {
        if (!TryGetSupabaseUserId(User, out var userId))
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

        if (await db.Users.AnyAsync(u => u.Id == userId, cancellationToken))
        {
            logger.LogInformation("User sync: {UserId} already exists, skipping insert.", userId);
            return NoContent();
        }

        var user = new AppUser
        {
            Id = userId,
            Email = email,
            FirstName = firstName,
            LastName = lastName,
            CreatedAtUtc = DateTime.UtcNow,
            OnboardingCompleted = false,
        };

        db.Users.Add(user);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            logger.LogInformation("User sync: created profile row for {UserId} ({Email}).", userId, email);
        }
        catch (DbUpdateException ex)
        {
            logger.LogWarning(ex, "User sync: could not insert {UserId}", userId);
            return Conflict(new { message = "User profile could not be created." });
        }

        return NoContent();
    }

    private static bool TryGetSupabaseUserId(ClaimsPrincipal user, out Guid userId)
    {
        var candidates = new[]
        {
            user.FindFirstValue(ClaimTypes.NameIdentifier),
            user.FindFirstValue(JwtRegisteredClaimNames.Sub),
            user.FindFirstValue("sub"),
            user.FindFirstValue("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"),
        };

        foreach (var raw in candidates)
        {
            if (string.IsNullOrWhiteSpace(raw))
                continue;
            if (Guid.TryParse(raw.Trim(), out userId))
                return true;
        }

        userId = default;
        return false;
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
