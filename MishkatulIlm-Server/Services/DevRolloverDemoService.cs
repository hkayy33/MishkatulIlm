using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;

namespace MishkatulIlm_Server.Services;

/// <summary>Seeds a repeatable local demo: finished 4-week block, payment window open, no rollover yet.</summary>
public sealed class DevRolloverDemoService(
    AppDbContext db,
    SupabaseAdminAuthClient supabaseAdmin,
    ScheduleProposalService scheduleProposals,
    LessonBillingContextService billingContext,
    ILogger<DevRolloverDemoService> logger)
{
    public const string DemoEmail = "rollover.demo@local.test";
    public const string DemoPassword = "DemoPass123!";
    public const string DemoFirstName = "Rollover";
    public const string DemoLastName = "Demo";

    public async Task<(bool Success, string? Error, object? Payload)> SetupAsync(
        CancellationToken cancellationToken = default)
    {
        if (!supabaseAdmin.IsConfigured)
            return (false, "Add Supabase:ServiceRoleKey to user secrets first.", null);

        var userId = await EnsureDemoStudentAsync(cancellationToken);
        if (userId is null)
            return (false, "Could not create or find the demo Supabase user.", null);

        var user = await db.Users
            .Include(u => u.Onboarding)
            .FirstAsync(u => u.Id == userId.Value, cancellationToken);

        var now = DateTime.UtcNow;
        var weekOneStart = await FindConflictFreeWeekOneStartAsync(userId.Value, now, cancellationToken);
        if (weekOneStart is null)
        {
            return (false, "Could not find a conflict-free lesson time for the demo. Free a Tuesday slot and try again.", null);
        }

        var weekOne = new List<WeekOneLessonSlotDto>
        {
            new() { StartsAtUtc = weekOneStart.Value, DurationMinutes = 60 },
        };

        var pastBlock = LessonScheduleService.PlanFromWeekOneLessons(weekOne, "ONCE-WEEK")
            .Where(l => l.EndsAtUtc < now)
            .ToList();

        if (pastBlock.Count < LessonScheduleService.BookingWeeks)
        {
            return (false, "Could not build a fully completed past lesson block for the demo.", null);
        }

        var existingSlots = await db.LessonSlots
            .Where(s => s.StudentUserId == userId.Value)
            .ToListAsync(cancellationToken);

        foreach (var slot in existingSlots)
        {
            slot.StudentUserId = null;
            slot.StudentNote = null;
            slot.AttendanceStatus = AttendanceStatusCodes.Attending;
        }

        await db.SaveChangesAsync(cancellationToken);

        foreach (var lesson in pastBlock)
        {
            db.LessonSlots.Add(
                new LessonSlot
                {
                    Id = Guid.NewGuid(),
                    StudentUserId = userId.Value,
                    StartsAtUtc = lesson.StartsAtUtc,
                    EndsAtUtc = lesson.EndsAtUtc,
                    CreatedAtUtc = now,
                });
        }

        var (billingYear, billingMonth) = LessonBillingService.BillingMonthForLessonStart(
            LessonScheduleService.PlanRolloverBlock(weekOne, "ONCE-WEEK").First().StartsAtUtc);
        var dueUtc = now.Date.AddDays(3);

        user.ApplicationStatus = ApplicationStatusCodes.Active;
        user.OnboardingCompleted = true;
        user.LastPaymentAtUtc = now.AddMonths(-2);
        user.LastPaymentAmount = 20m;
        user.LastPaymentCurrency = "USD";
        user.NextPaymentDueUtc = dueUtc;

        if (user.Onboarding is null)
        {
            user.Onboarding = new StudentOnboardingProfile
            {
                UserId = user.Id,
                LessonFrequency = "ONCE-WEEK",
                Country = "United Kingdom",
                City = "London",
            };
            db.StudentOnboardingProfiles.Add(user.Onboarding);
        }
        else
        {
            user.Onboarding.LessonFrequency = "ONCE-WEEK";
        }

        var submissions = await db.PaymentSubmissions
            .Where(s => s.StudentUserId == userId.Value)
            .ToListAsync(cancellationToken);

        db.PaymentSubmissions.RemoveRange(submissions);

        await db.SaveChangesAsync(cancellationToken);

        var rolloverPreview = LessonScheduleService.PlanRolloverBlock(weekOne, "ONCE-WEEK");
        var billing = await billingContext.ResolveAsync(user, now, cancellationToken);
        var summary = StudentPaymentSummaryBuilder.Build(user, currentSubmission: null, utcNow: now, billing);

        logger.LogInformation("Dev rollover demo reset for {Email} ({UserId}).", DemoEmail, userId);

        return (
            true,
            null,
            new
            {
                message =
                    "Demo reset. Sign in as the demo student, open Payments, submit payment, then approve as admin to trigger rollover.",
                student = new { email = DemoEmail, password = DemoPassword },
                billingPeriod = billing.IsRolloverBlock && billing.PlannedRollover is { Count: > 0 }
                    ? LessonBillingService.FormatRolloverBillingPeriod(billing.PlannedRollover)
                    : LessonBillingService.FormatBillingPeriod(billingYear, billingMonth),
                paymentDueUtc = dueUtc,
                daysUntilDue = summary.DaysUntilDue,
                canSubmitPayment = summary.CanSubmitPayment,
                pastLessons = pastBlock.Count,
                upcomingLessons = 0,
                nextRolloverLessonUtc = rolloverPreview.FirstOrDefault()?.StartsAtUtc,
                rolloverLessonCount = rolloverPreview.Count,
            });
    }

    private async Task<Guid?> EnsureDemoStudentAsync(CancellationToken cancellationToken)
    {
        var existing = await db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Email == DemoEmail, cancellationToken);

        if (existing is not null)
            return existing.Id;

        var newId = await supabaseAdmin.CreateUserAsync(
            DemoEmail,
            DemoPassword,
            DemoFirstName,
            DemoLastName,
            cancellationToken,
            onboardingCompletedInMetadata: true);

        if (newId is null)
        {
            existing = await db.Users.AsNoTracking()
                .FirstOrDefaultAsync(u => u.Email == DemoEmail, cancellationToken);
            return existing?.Id;
        }

        await UserProfileProvisioner.EnsureAsync(
            db,
            newId.Value,
            DemoEmail,
            DemoFirstName,
            DemoLastName,
            isAdmin: false,
            onboardingCompleted: true,
            cancellationToken);

        return newId;
    }

    private async Task<DateTime?> FindConflictFreeWeekOneStartAsync(
        Guid studentUserId,
        DateTime utcNow,
        CancellationToken cancellationToken)
    {
        var tuesday = AlignToTuesdayUtc(utcNow.AddDays(-30));

        for (var hour = 8; hour <= 18; hour++)
        {
            var weekOneStart = tuesday.AddHours(hour);
            var weekOne = new List<WeekOneLessonSlotDto>
            {
                new() { StartsAtUtc = weekOneStart, DurationMinutes = 60 },
            };

            var rollover = LessonScheduleService.PlanRolloverBlock(weekOne, "ONCE-WEEK");
            if (rollover.Count == 0 || rollover.Any(l => l.StartsAtUtc < utcNow.AddMinutes(-5)))
                continue;

            var error = await scheduleProposals.ValidatePlannedLessonsAsync(studentUserId, rollover, cancellationToken);
            if (error is null)
                return weekOneStart;
        }

        return null;
    }

    private static DateTime AlignToTuesdayUtc(DateTime instant)
    {
        var utc = DateTime.SpecifyKind(instant, DateTimeKind.Utc);
        var day = utc.Date;
        var offset = ((int)DayOfWeek.Tuesday - (int)day.DayOfWeek + 7) % 7;
        return day.AddDays(offset);
    }
}
