using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;

namespace MishkatulIlm_Server.Services;

public sealed class DevBootstrapStudentService(AppDbContext db, SupabaseAdminAuthClient supabaseAdmin)
{
    public async Task<(bool Success, string? Error, object? Payload)> CreateFullyOnboardedStudentAsync(
        string email,
        string password,
        string firstName,
        string lastName,
        string applicationStatus,
        bool prepareForStripePayment,
        CancellationToken cancellationToken = default)
    {
        if (!supabaseAdmin.IsConfigured)
            return (false, "Add Supabase:ServiceRoleKey to user secrets first.", null);

        if (email.Length is < 3 or > 320 || !email.Contains('@', StringComparison.Ordinal))
            return (false, "Provide a valid email.", null);
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8)
            return (false, "Password must be at least 8 characters.", null);

        var status = string.IsNullOrWhiteSpace(applicationStatus)
            ? ApplicationStatusCodes.Pending
            : applicationStatus.Trim().ToUpperInvariant();

        var existing = await db.Users
            .Include(u => u.Onboarding)
            .FirstOrDefaultAsync(u => u.Email == email && !u.IsAdmin, cancellationToken);

        if (existing is not null)
        {
            ApplyOnboardingComplete(existing, status);
            if (prepareForStripePayment)
                await SeedStripePaymentDemoAsync(existing.Id, cancellationToken);
            else
                await db.SaveChangesAsync(cancellationToken);

            return (
                true,
                null,
                new
                {
                    message = prepareForStripePayment
                        ? "Updated student and seeded billable lessons for Stripe checkout testing."
                        : "Updated existing student profile with completed onboarding.",
                    email,
                    password = (string?)null,
                    userId = existing.Id,
                    applicationStatus = existing.ApplicationStatus,
                    prepareForStripePayment,
                });
        }

        var newId = await supabaseAdmin.CreateUserAsync(
            email,
            password,
            firstName,
            lastName,
            cancellationToken,
            onboardingCompletedInMetadata: true);

        if (newId is null)
        {
            existing = await db.Users
                .Include(u => u.Onboarding)
                .FirstOrDefaultAsync(u => u.Email == email && !u.IsAdmin, cancellationToken);
            if (existing is null)
            {
                return (
                    false,
                    "Could not create Supabase user (email may already exist in Auth without a profile row).",
                    null);
            }

            ApplyOnboardingComplete(existing, status);
            if (prepareForStripePayment)
                await SeedStripePaymentDemoAsync(existing.Id, cancellationToken);
            else
                await db.SaveChangesAsync(cancellationToken);

            return (
                true,
                null,
                new
                {
                    message =
                        "Linked existing auth user and marked onboarding complete. Sign in with your existing password.",
                    email,
                    password = (string?)null,
                    userId = existing.Id,
                    applicationStatus = existing.ApplicationStatus,
                    prepareForStripePayment,
                });
        }

        await UserProfileProvisioner.EnsureAsync(
            db,
            newId.Value,
            email,
            firstName,
            lastName,
            isAdmin: false,
            onboardingCompleted: true,
            cancellationToken);

        var user = await db.Users
            .Include(u => u.Onboarding)
            .FirstAsync(u => u.Id == newId.Value, cancellationToken);

        ApplyOnboardingComplete(user, status);
        if (prepareForStripePayment)
            await SeedStripePaymentDemoAsync(user.Id, cancellationToken);
        else
            await db.SaveChangesAsync(cancellationToken);

        return (
            true,
            null,
            new
            {
                message = prepareForStripePayment
                    ? "Student created with billable lessons. Sign in, open Payments, and use Pay now with Stripe."
                    : "Student created. Sign in at /login with this email and password.",
                email,
                password,
                userId = user.Id,
                applicationStatus = user.ApplicationStatus,
                prepareForStripePayment,
            });
    }

    private async Task SeedStripePaymentDemoAsync(Guid userId, CancellationToken cancellationToken)
    {
        var existingSlots = await db.LessonSlots
            .Where(s => s.StudentUserId == userId)
            .ToListAsync(cancellationToken);
        db.LessonSlots.RemoveRange(existingSlots);

        var submissions = await db.PaymentSubmissions
            .Where(s => s.StudentUserId == userId)
            .ToListAsync(cancellationToken);
        db.PaymentSubmissions.RemoveRange(submissions);

        var user = await db.Users.FirstAsync(u => u.Id == userId, cancellationToken);
        user.ApplicationStatus = ApplicationStatusCodes.Active;
        user.LastPaymentAtUtc = null;
        user.LastPaymentAmount = null;
        user.LastPaymentCurrency = LessonBillingService.DefaultCurrency;
        user.NextPaymentDueUtc = null;

        var now = DateTime.UtcNow;
        var firstLessonStart = now.Date.AddDays(2).AddHours(15);
        if (firstLessonStart <= now.AddHours(1))
            firstLessonStart = firstLessonStart.AddDays(1);

        for (var week = 0; week < 4; week++)
        {
            var startsAt = firstLessonStart.AddDays(week * 7);
            db.LessonSlots.Add(
                new LessonSlot
                {
                    Id = Guid.NewGuid(),
                    StudentUserId = userId,
                    StartsAtUtc = startsAt,
                    EndsAtUtc = startsAt.AddMinutes(60),
                    AttendanceStatus = AttendanceStatusCodes.Attending,
                    CreatedAtUtc = now,
                });
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private static void ApplyOnboardingComplete(AppUser user, string applicationStatus)
    {
        user.OnboardingCompleted = true;
        user.ApplicationStatus = applicationStatus;

        if (user.Onboarding is null)
            user.Onboarding = new StudentOnboardingProfile { UserId = user.Id };

        SeedOnboardingProfile(user.Onboarding);
    }

    internal static void SeedOnboardingProfile(StudentOnboardingProfile profile)
    {
        profile.AgeRange = "ADULT";
        profile.Gender = "MALE";
        profile.Country = "United Kingdom";
        profile.City = "London";
        profile.PhoneNumber = "+44 7700 900456";
        profile.CurrentLevel = "BEGINNER";
        profile.LessonFrequency = "ONCE-WEEK";
        profile.PreferredLessonDuration = PreferredLessonDurationRules.Min60;
        profile.SubjectCodes = ["QURAN", "ARABIC"];
        profile.PreferredAvailability = ["TUE-EVENING", "THU-AFTERNOON"];
    }
}
