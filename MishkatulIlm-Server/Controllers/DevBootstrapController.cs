using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;
using MishkatulIlm_Server.Services;

namespace MishkatulIlm_Server.Controllers;

/// <summary>
/// Creates a Supabase Auth user + <c>public.users</c> row with admin rights.
/// Allowed only when <see cref="IWebHostEnvironment.IsDevelopment"/> is true, or when
/// configuration <c>DevBootstrap:Enabled</c> is <c>true</c> (use user secrets locally; never enable in production).
/// Requires <c>Supabase:ServiceRoleKey</c>.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("api/dev")]
public sealed class DevBootstrapController(
    IWebHostEnvironment env,
    IConfiguration configuration,
    AppDbContext db,
    SupabaseAdminAuthClient supabaseAdmin,
    ILogger<DevBootstrapController> logger) : ControllerBase
{
    [HttpPost("admin-account")]
    public async Task<IActionResult> CreateDevAdmin(
        [FromBody] DevBootstrapAdminRequest request,
        CancellationToken cancellationToken)
    {
        if (!IsBootstrapAllowed())
            return NotFound();

        if (!supabaseAdmin.IsConfigured)
        {
            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                new
                {
                    message =
                        "Add Supabase:ServiceRoleKey (and Url) to appsettings.Development.json or user secrets, then POST again.",
                });
        }

        var email = request.Email.Trim();
        var password = request.Password;
        var first = string.IsNullOrWhiteSpace(request.FirstName) ? "Admin" : request.FirstName.Trim();
        var last = string.IsNullOrWhiteSpace(request.LastName) ? "User" : request.LastName.Trim();

        if (email.Length is < 3 or > 320 || !email.Contains('@', StringComparison.Ordinal))
            return BadRequest(new { message = "Provide a valid email." });
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8)
            return BadRequest(new { message = "Password must be at least 8 characters." });

        var existing = await db.Users.FirstOrDefaultAsync(u => u.Email == email, cancellationToken);
        if (existing is not null)
        {
            existing.IsAdmin = true;
            existing.OnboardingCompleted = true;
            existing.FirstName = first;
            existing.LastName = last;
            await db.SaveChangesAsync(cancellationToken);
            logger.LogInformation("Dev bootstrap: updated existing user row for {Email} to admin.", email);
            return Ok(
                new
                {
                    message =
                        "That email already had a profile row; it is now admin + onboarding completed. " +
                        "Sign in with this email and your existing Supabase password (or reset it in the dashboard).",
                    email,
                });
        }

        var newId = await supabaseAdmin.CreateUserAsync(email, password, first, last, cancellationToken, true);
        if (newId is null)
        {
            return Conflict(
                new
                {
                    message =
                        "Could not create Supabase user (email may already exist in Auth). " +
                        "Delete the user in Authentication or pick another email, then try again.",
                    email,
                });
        }

        try
        {
            await UserProfileProvisioner.EnsureAsync(
                db,
                newId.Value,
                email,
                first,
                last,
                isAdmin: true,
                onboardingCompleted: true,
                cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            logger.LogError(ex, "Dev bootstrap: failed to ensure users row for {UserId}", newId);
            return Problem(
                "Supabase user was created but saving public.users failed. Remove the orphan auth user in the dashboard if needed.");
        }

        logger.LogInformation("Dev bootstrap: created admin {Email} ({UserId}).", email, newId);
        return Ok(
            new
            {
                message = "You can sign in at /login with this email and password.",
                email,
                userId = newId.Value,
            });
    }

    private bool IsBootstrapAllowed() =>
        env.IsDevelopment()
        || string.Equals(configuration["DevBootstrap:Enabled"], "true", StringComparison.OrdinalIgnoreCase);
}
