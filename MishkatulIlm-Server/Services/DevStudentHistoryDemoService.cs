using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;

namespace MishkatulIlm_Server.Services;

/// <summary>Seeds a repeatable local demo student with ~3 months of past lessons and payment history.</summary>
public sealed class DevStudentHistoryDemoService(
    AppDbContext db,
    SupabaseAdminAuthClient supabaseAdmin,
    SchedulingSettingsService schedulingSettings,
    ILogger<DevStudentHistoryDemoService> logger)
{
    public const string DemoEmail = "history.demo@local.test";
    public const string DemoPassword = "DemoPass123!";
    public const string DemoFirstName = "History";
    public const string DemoLastName = "Demo";

    private const int PastMonths = 3;
    private const int LessonHourUtc = 15;

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
        var periodStart = now.AddMonths(-PastMonths);
        var pastLessons = BuildPastWeeklyLessons(periodStart, now, LessonHourUtc);

        if (pastLessons.Count == 0)
            return (false, "Could not build past lessons for the demo period.", null);

        await ClearStudentDataAsync(userId.Value, cancellationToken);

        var slotIndex = 0;
        foreach (var lesson in pastLessons)
        {
            var attendance = slotIndex == 4
                ? AttendanceStatusCodes.NotAttending
                : AttendanceStatusCodes.Attending;
            var note = slotIndex == 8 ? "Running 10 minutes late — stuck in traffic." : null;

            db.LessonSlots.Add(
                new LessonSlot
                {
                    Id = Guid.NewGuid(),
                    StudentUserId = userId.Value,
                    StartsAtUtc = lesson.StartsAtUtc,
                    EndsAtUtc = lesson.EndsAtUtc,
                    AttendanceStatus = attendance,
                    StudentNote = note,
                    CreatedAtUtc = lesson.StartsAtUtc.AddDays(-2),
                });

            slotIndex++;
        }

        user.ApplicationStatus = ApplicationStatusCodes.Active;
        user.OnboardingCompleted = true;

        EnsureOnboarding(user);

        var settings = await schedulingSettings.GetEntityAsync(cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        var seededSlots = await db.LessonSlots
            .Where(s => s.StudentUserId == userId.Value)
            .OrderBy(s => s.StartsAtUtc)
            .ToListAsync(cancellationToken);

        var monthGroups = seededSlots
            .GroupBy(l => LessonBillingService.BillingMonthForLessonStart(l.StartsAtUtc))
            .OrderBy(g => g.Key.Year)
            .ThenBy(g => g.Key.Month)
            .ToList();

        // Pay every completed billing month except the most recent one (current open period).
        var paidMonths = monthGroups.Count > 1 ? monthGroups.Take(monthGroups.Count - 1) : [];

        var paymentReference = PaymentReferenceHelper.Build(user);
        DateTime? lastPaidAt = null;
        decimal? lastPaidAmount = null;

        foreach (var group in paidMonths)
        {
            var (year, month) = group.Key;
            var monthSlots = group.ToList();

            var statement = LessonBillingService.BuildStatement(
                user,
                monthSlots,
                settings,
                year,
                month,
                currentSubmission: null,
                utcNow: now);

            if (statement.TotalAmount <= 0)
                continue;

            var reviewedAt = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1).AddDays(-2);
            if (reviewedAt > now)
                reviewedAt = now.AddDays(-7);

            db.PaymentSubmissions.Add(
                new PaymentSubmission
                {
                    Id = Guid.NewGuid(),
                    StudentUserId = userId.Value,
                    BillingYear = year,
                    BillingMonth = month,
                    Status = PaymentSubmissionStatusCodes.Paid,
                    Amount = statement.TotalAmount,
                    Currency = statement.Currency,
                    PaymentReference = paymentReference,
                    SubmittedAtUtc = reviewedAt.AddDays(-1),
                    ReviewedAtUtc = reviewedAt,
                });

            lastPaidAt = reviewedAt;
            lastPaidAmount = statement.TotalAmount;
        }

        user.LastPaymentAtUtc = lastPaidAt;
        user.LastPaymentAmount = lastPaidAmount;
        user.LastPaymentCurrency = LessonBillingService.DefaultCurrency;
        user.NextPaymentDueUtc = lastPaidAt is not null
            ? LessonBillingService.NextPaymentDueAfterPaid(lastPaidAt.Value)
            : null;

        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Dev student history demo reset for {Email} ({UserId}): {Past} past lessons over {Months} months.",
            DemoEmail,
            userId,
            pastLessons.Count,
            PastMonths);

        return (
            true,
            null,
            new
            {
                message =
                    "Demo student ready. Sign in as admin and open Active students → History Demo, or sign in as the student.",
                student = new { email = DemoEmail, password = DemoPassword, userId = userId.Value },
                pastLessons = pastLessons.Count,
                pastMonths = PastMonths,
                periodStartUtc = pastLessons[0].StartsAtUtc,
                periodEndUtc = pastLessons[^1].EndsAtUtc,
                paidSubmissions = paidMonths.Count(),
                adminUrl = $"/admin/students/{userId.Value}",
            });
    }

    private async Task ClearStudentDataAsync(Guid userId, CancellationToken cancellationToken)
    {
        var existingSlots = await db.LessonSlots
            .Where(s => s.StudentUserId == userId)
            .ToListAsync(cancellationToken);

        db.LessonSlots.RemoveRange(existingSlots);

        var submissions = await db.PaymentSubmissions
            .Where(s => s.StudentUserId == userId)
            .ToListAsync(cancellationToken);

        db.PaymentSubmissions.RemoveRange(submissions);
    }

    private static List<PlannedLessonSlotDto> BuildPastWeeklyLessons(
        DateTime periodStartUtc,
        DateTime utcNow,
        int lessonHourUtc)
    {
        var lessons = new List<PlannedLessonSlotDto>();
        var cursor = AlignToThursdayUtc(periodStartUtc).AddHours(lessonHourUtc);

        while (true)
        {
            var endsAt = cursor.AddMinutes(60);
            if (endsAt > utcNow)
                break;

            lessons.Add(
                new PlannedLessonSlotDto
                {
                    StartsAtUtc = cursor,
                    EndsAtUtc = endsAt,
                });

            cursor = cursor.AddDays(7);
        }

        return lessons;
    }

    private static void EnsureOnboarding(AppUser user)
    {
        if (user.Onboarding is null)
        {
            user.Onboarding = new StudentOnboardingProfile
            {
                UserId = user.Id,
                AgeRange = "ADULT",
                Gender = "FEMALE",
                Country = "United Kingdom",
                City = "Manchester",
                PhoneNumber = "+44 7700 900123",
                CurrentLevel = "BEGINNER",
                LessonFrequency = "ONCE-WEEK",
                PreferredLessonDuration = PreferredLessonDurationRules.Min60,
                SubjectCodes = ["QURAN", "TAJWEED"],
                PreferredAvailability = ["THU-AFTERNOON"],
            };
            return;
        }

        user.Onboarding.AgeRange = "ADULT";
        user.Onboarding.Gender = "FEMALE";
        user.Onboarding.Country = "United Kingdom";
        user.Onboarding.City = "Manchester";
        user.Onboarding.PhoneNumber = "+44 7700 900123";
        user.Onboarding.CurrentLevel = "BEGINNER";
        user.Onboarding.LessonFrequency = "ONCE-WEEK";
        user.Onboarding.PreferredLessonDuration = PreferredLessonDurationRules.Min60;
        user.Onboarding.SubjectCodes = ["QURAN", "TAJWEED"];
        user.Onboarding.PreferredAvailability = ["THU-AFTERNOON"];
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

    private static DateTime AlignToThursdayUtc(DateTime instant)
    {
        var utc = DateTime.SpecifyKind(instant, DateTimeKind.Utc);
        var day = utc.Date;
        var offset = ((int)DayOfWeek.Thursday - (int)day.DayOfWeek + 7) % 7;
        return day.AddDays(offset);
    }
}
