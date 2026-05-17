using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;

namespace MishkatulIlm_Server.Services;

public enum DeleteStudentAccountStatus
{
    NotFound,
    Deleted,
    AuthNotConfigured,
    AuthDeleteFailed,
}

public sealed class StudentAccountDeletionService(
    AppDbContext db,
    SupabaseAdminAuthClient supabaseAdmin,
    ILogger<StudentAccountDeletionService> logger)
{
    public async Task<DeleteStudentAccountStatus> DeleteStudentAccountAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        var userExists = await db.Users.AnyAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);
        if (!userExists)
            return DeleteStudentAccountStatus.NotFound;

        if (!supabaseAdmin.IsConfigured)
        {
            logger.LogError(
                "Account deletion aborted for {UserId}: Supabase:ServiceRoleKey (and Url) are not configured.",
                userId);
            return DeleteStudentAccountStatus.AuthNotConfigured;
        }

        var authDeleted = await supabaseAdmin.DeleteUserAsync(userId, cancellationToken);
        if (!authDeleted)
        {
            logger.LogError(
                "Account deletion aborted for {UserId}: Supabase auth user could not be removed.",
                userId);
            return DeleteStudentAccountStatus.AuthDeleteFailed;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);
        if (user is null)
        {
            await transaction.CommitAsync(cancellationToken);
            logger.LogWarning(
                "Supabase auth user {UserId} was deleted but application profile row was already missing.",
                userId);
            return DeleteStudentAccountStatus.Deleted;
        }

        var bookedSlots = await db.LessonSlots
            .Where(s => s.StudentUserId == userId)
            .ToListAsync(cancellationToken);
        foreach (var slot in bookedSlots)
        {
            slot.StudentUserId = null;
            slot.StudentNote = null;
            slot.AttendanceStatus = AttendanceStatusCodes.Attending;
        }

        await db.ScheduleChangeRequests
            .Where(r => r.StudentUserId == userId)
            .ExecuteDeleteAsync(cancellationToken);

        await db.ScheduleProposals
            .Where(p => p.StudentUserId == userId)
            .ExecuteDeleteAsync(cancellationToken);

        if (user.Onboarding is not null)
            db.StudentOnboardingProfiles.Remove(user.Onboarding);
        else
        {
            var profile = await db.StudentOnboardingProfiles
                .FirstOrDefaultAsync(p => p.UserId == userId, cancellationToken);
            if (profile is not null)
                db.StudentOnboardingProfiles.Remove(profile);
        }

        db.Users.Remove(user);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        logger.LogInformation("Fully deleted student account {UserId} (auth + application data).", userId);
        return DeleteStudentAccountStatus.Deleted;
    }
}
