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
    ScheduleProposalService scheduleProposals,
    IWebHostEnvironment env,
    ILogger<OnboardingController> logger) : ControllerBase
{
    public const int MaxSubjects = 4;

    [HttpGet("me")]
    public async Task<IActionResult> GetMyApplication(CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        var user = await db.Users.AsNoTracking()
            .Include(u => u.Onboarding)
            .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);

        if (user is null)
        {
            return Ok(
                new StudentApplicationResponse
                {
                    Status = "pending_application",
                    OnboardingCompleted = false,
                });
        }

        var status = ResolveStudentApplicationStatus(user);
        StudentApplicationSummary? summary = null;
        if (user.Onboarding is { } profile)
        {
            summary = new StudentApplicationSummary
            {
                Country = profile.Country,
                City = profile.City,
                CurrentLevel = profile.CurrentLevel,
                LessonFrequency = profile.LessonFrequency,
                SubjectCodes = profile.SubjectCodes,
                PreferredAvailability = profile.PreferredAvailability,
            };
        }

        ScheduleProposalDto? proposalDto = null;
        if (user.ApplicationStatus == ApplicationStatusCodes.AwaitingReply)
        {
            var proposal = await scheduleProposals.GetOpenProposalForStudentAsync(user.Id, cancellationToken);
            if (proposal is not null)
                proposalDto = ScheduleProposalService.ToDto(proposal);
        }

        return Ok(
            new StudentApplicationResponse
            {
                Status = status,
                OnboardingCompleted = user.OnboardingCompleted,
                Summary = summary,
                ScheduleProposal = proposalDto,
                RejectionMessage =
                    user.ApplicationStatus == ApplicationStatusCodes.Inactive
                        ? user.ApplicationDeclineMessage
                        : null,
            });
    }

    [HttpPost("me/schedule-proposal/accept")]
    public async Task<IActionResult> AcceptScheduleProposal(CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null)
            return NotFound(new { message = "Account not found." });

        if (user.ApplicationStatus != ApplicationStatusCodes.AwaitingReply)
            return BadRequest(new { message = "There is no schedule waiting for your response." });

        var proposal = await db.ScheduleProposals
            .FirstOrDefaultAsync(
                p => p.StudentUserId == userId && p.Status == ScheduleProposalCodes.AwaitingStudent,
                cancellationToken);

        if (proposal is null)
            return NotFound(new { message = "Schedule proposal not found." });

        try
        {
            await scheduleProposals.BookPlannedLessonsAsync(userId, proposal.PlannedLessons, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }

        proposal.Status = ScheduleProposalCodes.Accepted;
        proposal.UpdatedAtUtc = DateTime.UtcNow;
        user.ApplicationStatus = ApplicationStatusCodes.Active;
        await db.SaveChangesAsync(cancellationToken);

        return Ok(
            new StudentApplicationResponse
            {
                Status = "matched",
                OnboardingCompleted = user.OnboardingCompleted,
            });
    }

    [HttpPost("me/schedule-proposal/amend")]
    public async Task<IActionResult> AmendScheduleProposal(
        [FromBody] AmendScheduleProposalRequest request,
        CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return Unauthorized();

        var note = request.Note.Trim();
        if (note.Length < 10)
            return BadRequest(new { message = "Please describe which days and times work for you (at least 10 characters)." });

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null)
            return NotFound(new { message = "Account not found." });

        if (user.ApplicationStatus != ApplicationStatusCodes.AwaitingReply)
            return BadRequest(new { message = "There is no schedule waiting for your response." });

        var proposal = await db.ScheduleProposals
            .FirstOrDefaultAsync(
                p => p.StudentUserId == userId && p.Status == ScheduleProposalCodes.AwaitingStudent,
                cancellationToken);

        if (proposal is null)
            return NotFound(new { message = "Schedule proposal not found." });

        proposal.Status = ScheduleProposalCodes.StudentAmended;
        proposal.StudentAmendNote = note;
        proposal.UpdatedAtUtc = DateTime.UtcNow;
        user.ApplicationStatus = ApplicationStatusCodes.Pending;
        await db.SaveChangesAsync(cancellationToken);

        return Ok(
            new StudentApplicationResponse
            {
                Status = "under_review",
                OnboardingCompleted = user.OnboardingCompleted,
            });
    }

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

        if (!LessonFrequencyRules.TryValidate(request.LessonFrequency, distinct.Count, out var frequencyError))
            return BadRequest(new { message = frequencyError });

        var phoneNumber = request.PhoneNumber.Trim();
        if (phoneNumber.Length is < 7 or > 32)
            return BadRequest(new { message = "Enter a valid phone number (7–32 characters)." });

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
                Country = request.Country.Trim(),
                City = request.City.Trim(),
                PhoneNumber = phoneNumber,
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
            profile.Country = request.Country.Trim();
            profile.City = request.City.Trim();
            profile.PhoneNumber = phoneNumber;
            profile.CurrentLevel = request.CurrentLevel.Trim();
            profile.LessonFrequency = request.LessonFrequency.Trim();
            profile.SubjectCodes = distinct;
            profile.PreferredAvailability = availability;
        }

        user.OnboardingCompleted = true;
        if (user.ApplicationStatus is not ApplicationStatusCodes.Active
            and not ApplicationStatusCodes.Inactive
            and not ApplicationStatusCodes.AwaitingReply)
            user.ApplicationStatus = ApplicationStatusCodes.Pending;

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

    private static string ResolveStudentApplicationStatus(AppUser user)
    {
        if (user.ApplicationStatus == ApplicationStatusCodes.Active)
            return "matched";
        if (user.ApplicationStatus == ApplicationStatusCodes.Inactive)
            return "rejected";
        if (user.ApplicationStatus == ApplicationStatusCodes.AwaitingReply)
            return "awaiting_reply";
        return user.OnboardingCompleted ? "under_review" : "pending_application";
    }

    private static bool IsUniqueEmailViolation(DbUpdateException ex) =>
        ex.InnerException?.Message.Contains("IX_users_Email", StringComparison.OrdinalIgnoreCase) == true
        || ex.InnerException?.Message.Contains("duplicate key", StringComparison.OrdinalIgnoreCase) == true;
}
