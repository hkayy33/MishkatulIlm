using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;

namespace MishkatulIlm_Server.Services;

public enum DeleteStudentAccountStatus
{
    NotFound,
    Deleted,
    DataDeletedAuthDeleteFailed,
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
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);
        if (user is null)
            return DeleteStudentAccountStatus.NotFound;

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

        if (!supabaseAdmin.IsConfigured)
        {
            logger.LogWarning(
                "Deleted application data for user {UserId} but Supabase admin is not configured; auth user may remain.",
                userId);
            return DeleteStudentAccountStatus.DataDeletedAuthDeleteFailed;
        }

        var authDeleted = await supabaseAdmin.DeleteUserAsync(userId, cancellationToken);
        if (!authDeleted)
        {
            logger.LogError(
                "Deleted application data for user {UserId} but failed to remove Supabase auth user.",
                userId);
            return DeleteStudentAccountStatus.DataDeletedAuthDeleteFailed;
        }

        logger.LogInformation("Fully deleted student account {UserId}.", userId);
        return DeleteStudentAccountStatus.Deleted;
    }
}
