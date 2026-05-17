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
    ScheduleProposalService scheduleProposals,
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

    [HttpGet("applications")]
    public Task<IActionResult> ListApplications(CancellationToken cancellationToken) =>
        ListPendingApplicationsCore(cancellationToken);

    [HttpGet("applications/pending")]
    public Task<IActionResult> ListPendingApplications(CancellationToken cancellationToken) =>
        ListPendingApplicationsCore(cancellationToken);

    [HttpGet("dashboard/badge-counts")]
    public async Task<IActionResult> GetBadgeCounts(CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        var pendingApplications = await db.Users.AsNoTracking().CountAsync(
            u =>
                !u.IsAdmin
                && (u.ApplicationStatus == ApplicationStatusCodes.Pending
                    || u.ApplicationStatus == ApplicationStatusCodes.AwaitingReply),
            cancellationToken);

        var pendingScheduleChanges = await db.ScheduleChangeRequests.AsNoTracking().CountAsync(
            r => r.Status == ScheduleChangeRequestCodes.Pending,
            cancellationToken);

        return Ok(
            new AdminBadgeCountsDto
            {
                PendingApplications = pendingApplications,
                PendingScheduleChanges = pendingScheduleChanges,
            });
    }

    [HttpGet("schedule-change-requests/pending")]
    public async Task<IActionResult> ListPendingScheduleChangeRequests(CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        var rows = await db.ScheduleChangeRequests
            .AsNoTracking()
            .Include(r => r.Student)
            .ThenInclude(s => s.Onboarding)
            .Where(r => r.Status == ScheduleChangeRequestCodes.Pending)
            .OrderByDescending(r => r.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        var items = rows
            .Select(r =>
            {
                var onboarding = r.Student.Onboarding;
                return new AdminScheduleChangeRequestListItem
                {
                    Id = r.Id,
                    StudentUserId = r.StudentUserId,
                    StudentName = $"{r.Student.FirstName} {r.Student.LastName}".Trim(),
                    Email = r.Student.Email,
                    Note = r.Note,
                    CreatedAtUtc = r.CreatedAtUtc,
                    AgeRange = onboarding?.AgeRange,
                    Gender = onboarding?.Gender,
                    Country = onboarding?.Country,
                    City = onboarding?.City,
                    CurrentLevel = onboarding?.CurrentLevel,
                    LessonFrequency = onboarding?.LessonFrequency,
                    SubjectCodes = onboarding?.SubjectCodes ?? [],
                    PreferredAvailability = onboarding?.PreferredAvailability ?? [],
                };
            })
            .ToList();

        return Ok(items);
    }

    [HttpPost("schedule-change-requests/{requestId:guid}/resolve")]
    public async Task<IActionResult> ResolveScheduleChangeRequest(
        Guid requestId,
        [FromBody] ApproveApplicationRequest request,
        CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        var row = await db.ScheduleChangeRequests
            .Include(r => r.Student)
            .ThenInclude(s => s.Onboarding)
            .FirstOrDefaultAsync(r => r.Id == requestId, cancellationToken);

        if (row is null)
            return NotFound(new { message = "Schedule change request not found." });

        if (row.Status != ScheduleChangeRequestCodes.Pending)
            return BadRequest(new { message = "This request is no longer pending." });

        var profile = row.Student.Onboarding;
        if (profile is null)
            return BadRequest(new { message = "Student onboarding profile is missing." });

        if (row.Student.ApplicationStatus != ApplicationStatusCodes.Active)
            return BadRequest(new { message = "Only active students can have schedules changed this way." });

        if (!TryPlanLessonsFromRescheduleRequest(request, profile, out var planned, out var planError))
            return BadRequest(new { message = planError });

        var conflictMessage = await scheduleProposals.ValidatePlannedLessonsAsync(
            row.StudentUserId,
            planned,
            cancellationToken);
        if (conflictMessage is not null)
            return Conflict(new { message = conflictMessage });

        try
        {
            await scheduleProposals.RescheduleStudentLessonsAsync(row.StudentUserId, planned, cancellationToken);
            await scheduleProposals.SupersedeOpenProposalsForStudentAsync(
                row.StudentUserId,
                cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }

        var now = DateTime.UtcNow;
        row.Status = ScheduleChangeRequestCodes.Resolved;
        row.ResolvedAtUtc = now;
        row.AdminResponseMessage = null;
        await db.SaveChangesAsync(cancellationToken);

        var message = planned.Count > 0
            ? "The student's lessons have been rescheduled."
            : "The student's lessons have been cleared.";
        return Ok(new { message });
    }

    [HttpPost("schedule-change-requests/{requestId:guid}/decline")]
    public async Task<IActionResult> DeclineScheduleChangeRequest(
        Guid requestId,
        [FromBody] DeclineScheduleChangeRequest request,
        CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        var message = request.Message.Trim();
        if (message.Length < 10)
            return BadRequest(new { message = "Please include a message for the student (at least 10 characters)." });

        var row = await db.ScheduleChangeRequests.FirstOrDefaultAsync(r => r.Id == requestId, cancellationToken);
        if (row is null)
            return NotFound(new { message = "Schedule change request not found." });

        if (row.Status != ScheduleChangeRequestCodes.Pending)
            return BadRequest(new { message = "This request is no longer pending." });

        row.Status = ScheduleChangeRequestCodes.Declined;
        row.AdminResponseMessage = message;
        row.ResolvedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Ok(new { message = "The student has been notified on their dashboard." });
    }

    [HttpPost("applications/{userId:guid}/approve")]
    public async Task<IActionResult> ApproveApplication(
        Guid userId,
        [FromBody] ApproveApplicationRequest request,
        CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        var user = await db.Users
            .Include(u => u.Onboarding)
            .FirstOrDefaultAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);

        if (user is null)
            return NotFound(new { message = "Application not found." });

        if (!user.OnboardingCompleted || user.Onboarding is null)
            return BadRequest(new { message = "The student must complete onboarding before approval." });

        if (user.ApplicationStatus == ApplicationStatusCodes.Active)
            return Conflict(new { message = "This student is already active." });

        var profile = user.Onboarding;
        List<PlannedLessonSlotDto> planned;
        if (request.WeekOneLessons is { Count: > 0 })
        {
            if (!LessonScheduleService.TryValidateWeekOneLessons(
                    request.WeekOneLessons,
                    profile.LessonFrequency,
                    out var weekOneError))
                return BadRequest(new { message = weekOneError });

            planned = LessonScheduleService.PlanFromWeekOneLessons(
                request.WeekOneLessons,
                profile.LessonFrequency);
        }
        else if (request.WeekOneLessonStartsUtc is { Count: > 0 })
        {
            if (!LessonScheduleService.TryNormalizeDuration(
                    request.DurationMinutes,
                    out var duration,
                    out var durationError))
                return BadRequest(new { message = durationError });

            if (!LessonScheduleService.TryValidateWeekOneSlots(
                    request.WeekOneLessonStartsUtc,
                    profile.LessonFrequency,
                    duration,
                    out var weekOneError))
                return BadRequest(new { message = weekOneError });

            planned = LessonScheduleService.PlanFromWeekOneSlots(
                request.WeekOneLessonStartsUtc,
                profile.LessonFrequency,
                duration);
        }
        else
        {
            if (request.AnchorStartsAtUtc == default)
                return BadRequest(new { message = "Schedule lessons by selecting slots in the start week." });

            if (!LessonScheduleService.TryNormalizeDuration(
                    request.DurationMinutes,
                    out var duration,
                    out var durationError))
                return BadRequest(new { message = durationError });

            var anchor = DateTime.SpecifyKind(request.AnchorStartsAtUtc, DateTimeKind.Utc);
            if (anchor < DateTime.UtcNow.AddMinutes(-5))
                return BadRequest(new { message = "Cannot start scheduling in the past." });

            if (!LessonScheduleService.FitsDayWindow(anchor, duration))
                return BadRequest(new { message = "Lesson does not fit between 8am and 10pm UTC." });

            planned = LessonScheduleService.PlanMonthlyLessonStarts(
                    anchor,
                    profile.LessonFrequency,
                    profile.PreferredAvailability)
                .Select(start => new PlannedLessonSlotDto
                {
                    StartsAtUtc = start,
                    EndsAtUtc = LessonScheduleService.SlotEnd(start, duration),
                    DurationMinutes = duration,
                })
                .ToList();
        }

        if (planned.Count == 0)
            return BadRequest(new { message = "Could not plan lessons for this frequency and time." });

        var conflictMessage = await scheduleProposals.ValidatePlannedLessonsAsync(user.Id, planned, cancellationToken);
        if (conflictMessage is not null)
            return Conflict(new { message = conflictMessage });

        await scheduleProposals.CreateProposalAsync(user.Id, planned, cancellationToken);
        user.ApplicationStatus = ApplicationStatusCodes.AwaitingReply;
        await db.SaveChangesAsync(cancellationToken);

        var proposed = planned
            .OrderBy(l => l.StartsAtUtc)
            .Select(l => new ScheduledLessonDto
            {
                SlotId = Guid.Empty,
                StartsAtUtc = l.StartsAtUtc,
                EndsAtUtc = l.EndsAtUtc,
                DurationMinutes = l.DurationMinutes,
            })
            .ToList();

        return Ok(
            new ApproveApplicationResponse
            {
                UserId = user.Id,
                ApplicationStatus = ApplicationStatusCodes.ToApiValue(user.ApplicationStatus),
                LessonsBooked = proposed.Count,
                ScheduledLessons = proposed,
            });
    }

    [HttpPatch("applications/{userId:guid}/status")]
    public async Task<IActionResult> SetApplicationStatus(
        Guid userId,
        [FromBody] SetApplicationStatusRequest request,
        CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        if (!ApplicationStatusCodes.TryNormalize(request.Status, out var status, out var error))
            return BadRequest(new { message = error });

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);
        if (user is null)
            return NotFound(new { message = "Student application not found." });

        if (status == ApplicationStatusCodes.Active)
            return BadRequest(
                new { message = "Use Approve with lesson slots to activate a student." });

        user.ApplicationStatus = status;
        await db.SaveChangesAsync(cancellationToken);

        return Ok(
            new
            {
                userId = user.Id,
                applicationStatus = ApplicationStatusCodes.ToApiValue(user.ApplicationStatus),
            });
    }

    [HttpGet("students")]
    public async Task<IActionResult> ListStudents(CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        var activeStudents = await db.Users
            .AsNoTracking()
            .Where(u => !u.IsAdmin && u.ApplicationStatus == ApplicationStatusCodes.Active)
            .Include(u => u.Onboarding)
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .ToListAsync(cancellationToken);

        var studentIds = activeStudents.Select(u => u.Id).ToList();
        var lessonsByStudent = await db.LessonSlots.AsNoTracking()
            .Where(s => s.StudentUserId != null && studentIds.Contains(s.StudentUserId!.Value))
            .OrderBy(s => s.StartsAtUtc)
            .GroupBy(s => s.StudentUserId!.Value)
            .ToDictionaryAsync(
                g => g.Key,
                g => g.Select(s => new ScheduledLessonDto
                {
                    SlotId = s.Id,
                    StartsAtUtc = s.StartsAtUtc,
                    EndsAtUtc = s.EndsAtUtc,
                }).ToList(),
                cancellationToken);

        var now = DateTime.UtcNow;
        var rows = activeStudents
            .Select(u =>
            {
                var onboarding = u.Onboarding;
                var studentLessons = lessonsByStudent.GetValueOrDefault(u.Id) ?? [];
                var nextLessonSlot = studentLessons
                    .Where(l => l.EndsAtUtc > now)
                    .OrderBy(l => l.StartsAtUtc)
                    .FirstOrDefault();
                return new AdminStudentListItem
                {
                    UserId = u.Id,
                    Email = u.Email,
                    FirstName = u.FirstName,
                    LastName = u.LastName,
                    HasMadePayment = u.LastPaymentAtUtc is not null,
                    NextPaymentDueUtc = u.LastPaymentAtUtc is not null ? u.NextPaymentDueUtc : null,
                    NextLesson = nextLessonSlot,
                    PhoneNumber = string.IsNullOrWhiteSpace(onboarding?.PhoneNumber)
                        ? null
                        : onboarding.PhoneNumber,
                    Location = FormatStudentLocation(onboarding),
                    Country = TrimOrNull(onboarding?.Country),
                    City = TrimOrNull(onboarding?.City),
                    AgeRange = onboarding?.AgeRange,
                    Gender = onboarding?.Gender,
                    CurrentLevel = onboarding?.CurrentLevel,
                    LessonFrequency = onboarding?.LessonFrequency,
                    SubjectCodes = onboarding?.SubjectCodes ?? [],
                    PreferredAvailability = onboarding?.PreferredAvailability ?? [],
                    ScheduledLessons = studentLessons,
                };
            })
            .ToList();

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

    private async Task<IActionResult> ListPendingApplicationsCore(CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        // Map jsonb list fields in memory — SQL ternary with Array.Empty breaks on PostgreSQL (42846).
        var users = await db.Users
            .AsNoTracking()
            .Include(u => u.Onboarding)
            .Where(u =>
                !u.IsAdmin
                && (u.ApplicationStatus == ApplicationStatusCodes.Pending
                    || u.ApplicationStatus == ApplicationStatusCodes.AwaitingReply))
            .OrderByDescending(u => u.OnboardingCompleted)
            .ThenBy(u => u.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        var userIds = users.Select(u => u.Id).ToList();
        var latestProposals = await db.ScheduleProposals
            .AsNoTracking()
            .Where(p => userIds.Contains(p.StudentUserId) && p.Status != ScheduleProposalCodes.Superseded)
            .OrderByDescending(p => p.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        var proposalByStudent = latestProposals
            .GroupBy(p => p.StudentUserId)
            .ToDictionary(g => g.Key, g => g.First());

        var rows = users
            .Select(u =>
            {
                proposalByStudent.TryGetValue(u.Id, out var proposal);
                return new AdminApplicationListItem
            {
                UserId = u.Id,
                Email = u.Email,
                FirstName = u.FirstName,
                LastName = u.LastName,
                OnboardingCompleted = u.OnboardingCompleted,
                ApplicationStatus = ApplicationStatusCodes.ToApiValue(u.ApplicationStatus),
                ScheduleProposalStatus = proposal is null
                    ? null
                    : ScheduleProposalService.ToApiProposalStatus(proposal.Status),
                StudentAmendNote = proposal?.StudentAmendNote,
                CreatedAtUtc = u.CreatedAtUtc,
                AgeRange = u.Onboarding?.AgeRange,
                Gender = u.Onboarding?.Gender,
                Country = u.Onboarding?.Country,
                City = u.Onboarding?.City,
                CurrentLevel = u.Onboarding?.CurrentLevel,
                LessonFrequency = u.Onboarding?.LessonFrequency,
                SubjectCodes = u.Onboarding?.SubjectCodes ?? [],
                PreferredAvailability = u.Onboarding?.PreferredAvailability ?? [],
            };
            })
            .ToList();

        return Ok(rows);
    }

    private async Task<bool> IsCurrentUserAdminAsync(CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return false;

        return await db.Users.AsNoTracking().AnyAsync(u => u.Id == userId && u.IsAdmin, cancellationToken);
    }

    private static string? TrimOrNull(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private static string? FormatStudentLocation(StudentOnboardingProfile? onboarding)
    {
        if (onboarding is null)
            return null;

        var city = onboarding.City.Trim();
        var country = onboarding.Country.Trim();
        if (city.Length == 0 && country.Length == 0)
            return null;
        if (city.Length > 0 && country.Length > 0)
            return $"{city}, {country}";
        return city.Length > 0 ? city : country;
    }

    private static bool TryPlanLessonsFromRescheduleRequest(
        ApproveApplicationRequest request,
        StudentOnboardingProfile profile,
        out List<PlannedLessonSlotDto> planned,
        out string planError)
    {
        planned = [];
        planError = string.Empty;

        if (request.WeekOneLessons is not { Count: > 0 })
            return true;

        if (!LessonScheduleService.TryValidateWeekOneLessons(
                request.WeekOneLessons,
                profile.LessonFrequency,
                out planError,
                requireExactWeekOneCount: false))
            return false;

        planned = LessonScheduleService.PlanFromWeekOneLessons(
            request.WeekOneLessons,
            profile.LessonFrequency);
        return true;
    }

    private static bool TryPlanLessonsFromApproveRequest(
        ApproveApplicationRequest request,
        StudentOnboardingProfile profile,
        out List<PlannedLessonSlotDto> planned,
        out string planError)
    {
        planned = [];
        planError = string.Empty;

        if (request.WeekOneLessons is { Count: > 0 })
        {
            if (!LessonScheduleService.TryValidateWeekOneLessons(
                    request.WeekOneLessons,
                    profile.LessonFrequency,
                    out planError))
                return false;

            planned = LessonScheduleService.PlanFromWeekOneLessons(
                request.WeekOneLessons,
                profile.LessonFrequency);
            return planned.Count > 0;
        }

        if (request.WeekOneLessonStartsUtc is { Count: > 0 })
        {
            if (!LessonScheduleService.TryNormalizeDuration(
                    request.DurationMinutes,
                    out var duration,
                    out planError))
                return false;

            if (!LessonScheduleService.TryValidateWeekOneSlots(
                    request.WeekOneLessonStartsUtc,
                    profile.LessonFrequency,
                    duration,
                    out planError))
                return false;

            planned = LessonScheduleService.PlanFromWeekOneSlots(
                request.WeekOneLessonStartsUtc,
                profile.LessonFrequency,
                duration);
            return planned.Count > 0;
        }

        if (request.AnchorStartsAtUtc == default)
        {
            planError = "Schedule lessons by selecting slots in the start week.";
            return false;
        }

        if (!LessonScheduleService.TryNormalizeDuration(
                request.DurationMinutes,
                out var anchorDuration,
                out planError))
            return false;

        var anchor = DateTime.SpecifyKind(request.AnchorStartsAtUtc, DateTimeKind.Utc);
        if (anchor < DateTime.UtcNow.AddMinutes(-5))
        {
            planError = "Cannot start scheduling in the past.";
            return false;
        }

        if (!LessonScheduleService.FitsDayWindow(anchor, anchorDuration))
        {
            planError = "Lesson does not fit between 8am and 10pm UTC.";
            return false;
        }

        planned = LessonScheduleService.PlanMonthlyLessonStarts(
                anchor,
                profile.LessonFrequency,
                profile.PreferredAvailability)
            .Select(start => new PlannedLessonSlotDto
            {
                StartsAtUtc = start,
                EndsAtUtc = LessonScheduleService.SlotEnd(start, anchorDuration),
                DurationMinutes = anchorDuration,
            })
            .ToList();

        if (planned.Count == 0)
            planError = "Could not plan lessons for this frequency and time.";

        return planned.Count > 0;
    }
}
