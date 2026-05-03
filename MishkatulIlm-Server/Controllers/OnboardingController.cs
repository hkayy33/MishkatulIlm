using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;

namespace MishkatulIlm_Server.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public sealed class OnboardingController(AppDbContext db, ILogger<OnboardingController> logger) : ControllerBase
{
    public const int MaxSubjects = 4;

    [HttpPost]
    public async Task<IActionResult> Save([FromBody] SaveOnboardingRequest request, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
            return Unauthorized();

        if (request.SubjectCodes.Count is 0 or > MaxSubjects)
            return BadRequest(new { message = $"Select between 1 and {MaxSubjects} subjects." });

        var distinct = request.SubjectCodes.Select(c => c.Trim()).Where(c => c.Length > 0).Distinct().ToList();
        if (distinct.Count != request.SubjectCodes.Count)
            return BadRequest(new { message = "Duplicate subject selections are not allowed." });

        var email =
            User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Email)
            ?? string.Empty;

        var user = await db.Users.Include(u => u.Onboarding).FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null)
        {
            user = new AppUser
            {
                Id = userId,
                Email = email,
                FirstName = request.FirstName.Trim(),
                LastName = request.LastName.Trim(),
                CreatedAtUtc = DateTime.UtcNow,
                OnboardingCompleted = false,
            };
            db.Users.Add(user);
        }
        else
        {
            if (!string.IsNullOrWhiteSpace(email))
                user.Email = email;
            user.FirstName = request.FirstName.Trim();
            user.LastName = request.LastName.Trim();
        }

        if (user.Onboarding is null)
        {
            user.Onboarding = new StudentOnboardingProfile
            {
                UserId = user.Id,
                AgeRange = request.AgeRange.Trim(),
                Gender = request.Gender.Trim(),
                CurrentLevel = request.CurrentLevel.Trim(),
                LessonFrequency = request.LessonFrequency.Trim(),
                SubjectCodes = distinct,
            };
            db.StudentOnboardingProfiles.Add(user.Onboarding);
        }
        else
        {
            user.Onboarding.AgeRange = request.AgeRange.Trim();
            user.Onboarding.Gender = request.Gender.Trim();
            user.Onboarding.CurrentLevel = request.CurrentLevel.Trim();
            user.Onboarding.LessonFrequency = request.LessonFrequency.Trim();
            user.Onboarding.SubjectCodes = distinct;
        }

        user.OnboardingCompleted = true;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Onboarding save failed for {UserId}", userId);
            return Problem("Could not save onboarding.");
        }

        return NoContent();
    }
}
