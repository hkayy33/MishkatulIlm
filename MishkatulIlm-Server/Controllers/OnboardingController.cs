using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
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
[Route("api/[controller]")]
public sealed class OnboardingController(
    AppDbContext db,
    IWebHostEnvironment env,
    ILogger<OnboardingController> logger) : ControllerBase
{
    public const int MaxSubjects = 4;

    [HttpPost]
    public async Task<IActionResult> Save([FromBody] SaveOnboardingRequest request, CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        if (request.SubjectCodes is null || request.SubjectCodes.Count is 0 or > MaxSubjects)
            return BadRequest(new { message = $"Select between 1 and {MaxSubjects} subjects." });

        var distinct = request.SubjectCodes.Select(c => c.Trim()).Where(c => c.Length > 0).Distinct().ToList();
        if (distinct.Count is 0 or > MaxSubjects)
            return BadRequest(new { message = $"Select between 1 and {MaxSubjects} subjects." });
        if (distinct.Count != request.SubjectCodes.Count)
            return BadRequest(new { message = "Duplicate subject selections are not allowed." });

        if (!LessonAvailabilityCodes.TryNormalize(request.PreferredAvailability, out var availability, out var availabilityError))
            return BadRequest(new { message = availabilityError });

        var email =
            User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Email)
            ?? string.Empty;

        var user = await db.Users.Include(u => u.Onboarding).FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null)
        {
            if (string.IsNullOrWhiteSpace(email))
                email = $"{userId:N}@onboarding.local";

            try
            {
                await UserProfileProvisioner.EnsureAsync(
                    db,
                    userId,
                    email,
                    request.FirstName.Trim(),
                    request.LastName.Trim(),
                    isAdmin: false,
                    onboardingCompleted: null,
                    cancellationToken);
            }
            catch (DbUpdateException ex) when (IsUniqueEmailViolation(ex))
            {
                logger.LogWarning(ex, "Onboarding: email {Email} already used by another account.", email);
                return Conflict(
                    new
                    {
                        message =
                            "This email is already linked to another account. Sign in with that account or use a different email.",
                    });
            }

            user = await db.Users.Include(u => u.Onboarding).FirstAsync(u => u.Id == userId, cancellationToken);
        }

        user.FirstName = request.FirstName.Trim();
        user.LastName = request.LastName.Trim();
        await ApplyEmailIfAvailableAsync(user, email, cancellationToken);

        var profile = user.Onboarding;
        if (profile is null)
        {
            profile = new StudentOnboardingProfile
            {
                UserId = user.Id,
                AgeRange = request.AgeRange.Trim(),
                Gender = request.Gender.Trim(),
                CurrentLevel = request.CurrentLevel.Trim(),
                LessonFrequency = request.LessonFrequency.Trim(),
                SubjectCodes = distinct,
                PreferredAvailability = availability,
            };
            user.Onboarding = profile;
        }
        else
        {
            profile.AgeRange = request.AgeRange.Trim();
            profile.Gender = request.Gender.Trim();
            profile.CurrentLevel = request.CurrentLevel.Trim();
            profile.LessonFrequency = request.LessonFrequency.Trim();
            profile.SubjectCodes = distinct;
            profile.PreferredAvailability = availability;
        }

        user.OnboardingCompleted = true;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            var detail = ex.InnerException?.Message ?? ex.Message;
            logger.LogError(ex, "Onboarding save failed for {UserId}: {Detail}", userId, detail);
            if (env.IsDevelopment())
                return Problem(detail: detail, title: "Could not save onboarding.");
            return Problem("Could not save onboarding.");
        }

        return NoContent();
    }

    private async Task ApplyEmailIfAvailableAsync(AppUser user, string email, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(email))
            return;

        var taken = await db.Users.AsNoTracking()
            .AnyAsync(u => u.Email == email && u.Id != user.Id, cancellationToken);
        if (!taken)
            user.Email = email;
    }

    private static bool IsUniqueEmailViolation(DbUpdateException ex) =>
        ex.InnerException?.Message.Contains("IX_users_Email", StringComparison.OrdinalIgnoreCase) == true
        || ex.InnerException?.Message.Contains("duplicate key", StringComparison.OrdinalIgnoreCase) == true;
}
