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

[ApiController]
[Authorize]
[Route("api/[controller]")]
public sealed class AdminController(
    AppDbContext db,
    SupabaseAdminAuthClient supabaseAdmin,
    IOptions<AdminOptions> adminOptions,
    ILogger<AdminController> logger) : ControllerBase
{
    [HttpGet("users")]
    public async Task<IActionResult> ListUsers(CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        var rows = await db.Users
            .AsNoTracking()
            .OrderByDescending(u => u.CreatedAtUtc)
            .Select(u => new AdminUserListItem
            {
                UserId = u.Id,
                Email = u.Email,
                FirstName = u.FirstName,
                LastName = u.LastName,
                OnboardingCompleted = u.OnboardingCompleted,
                CreatedAtUtc = u.CreatedAtUtc,
            })
            .ToListAsync(cancellationToken);

        return Ok(rows);
    }

    [HttpGet("applications/pending")]
    public async Task<IActionResult> ListPendingApplications(CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        var rows = await db.Users
            .AsNoTracking()
            .Where(u => !u.OnboardingCompleted)
            .OrderBy(u => u.CreatedAtUtc)
            .Select(u => new AdminUserListItem
            {
                UserId = u.Id,
                Email = u.Email,
                FirstName = u.FirstName,
                LastName = u.LastName,
                OnboardingCompleted = u.OnboardingCompleted,
                CreatedAtUtc = u.CreatedAtUtc,
            })
            .ToListAsync(cancellationToken);

        return Ok(rows);
    }

    [HttpGet("students")]
    public async Task<IActionResult> ListStudents(CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        var rows = await db.Users
            .AsNoTracking()
            .Where(u => u.OnboardingCompleted && u.Onboarding != null)
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .Select(u => new AdminStudentListItem
            {
                UserId = u.Id,
                Email = u.Email,
                FirstName = u.FirstName,
                LastName = u.LastName,
                AgeRange = u.Onboarding!.AgeRange,
                Gender = u.Onboarding.Gender,
                CurrentLevel = u.Onboarding.CurrentLevel,
                LessonFrequency = u.Onboarding.LessonFrequency,
                SubjectCodes = u.Onboarding.SubjectCodes,
            })
            .ToListAsync(cancellationToken);

        return Ok(rows);
    }

    [HttpPost("users")]
    public async Task<IActionResult> CreateUser([FromBody] AdminCreateUserRequest request, CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        if (!supabaseAdmin.IsConfigured)
            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                new { message = "Server is missing Supabase:ServiceRoleKey (and Url). Add them to create accounts from the admin dashboard." });

        var email = request.Email.Trim();
        var first = request.FirstName.Trim();
        var last = request.LastName.Trim();
        if (email.Length is < 3 or > 320 || !email.Contains('@', StringComparison.Ordinal))
            return BadRequest(new { message = "Enter a valid email." });
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
            return BadRequest(new { message = "Password must be at least 8 characters." });
        if (first.Length is 0 or > 120 || last.Length is 0 or > 120)
            return BadRequest(new { message = "First and last name are required (max 120 characters each)." });

        if (await db.Users.AnyAsync(u => u.Email == email, cancellationToken))
            return Conflict(new { message = "A user with that email already exists in the app database." });

        var newId = await supabaseAdmin.CreateUserAsync(email, request.Password, first, last, cancellationToken);
        if (newId is null)
            return Problem("Could not create the Supabase user. Check server logs and that the email is not already registered.");

        var promoted = adminOptions.Value.IsPromotedAdminEmail(email);
        var isAdmin = request.IsAdmin || promoted;

        try
        {
            await UserProfileProvisioner.EnsureAsync(
                db,
                newId.Value,
                email,
                first,
                last,
                isAdmin,
                onboardingCompleted: false,
                cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            logger.LogError(ex, "Admin create user: profile ensure failed for Supabase id {UserId}", newId);
            return Problem("Supabase user was created but saving the profile row failed. You may need to clean up the auth user in Supabase.");
        }

        return StatusCode(StatusCodes.Status201Created, new { userId = newId.Value });
    }

    private async Task<bool> IsCurrentUserAdminAsync(CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return false;

        return await db.Users.AsNoTracking().AnyAsync(u => u.Id == userId && u.IsAdmin, cancellationToken);
    }
}
