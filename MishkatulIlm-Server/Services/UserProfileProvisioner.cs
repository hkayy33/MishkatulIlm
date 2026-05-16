using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;

namespace MishkatulIlm_Server.Services;

/// <summary>
/// Ensures a <c>public.users</c> row exists (DB trigger on <c>auth.users</c> is the primary path).
/// </summary>
public static class UserProfileProvisioner
{
    public static async Task<AppUser> EnsureAsync(
        AppDbContext db,
        Guid userId,
        string email,
        string firstName,
        string lastName,
        bool isAdmin,
        bool? onboardingCompleted,
        CancellationToken cancellationToken)
    {
        var existing = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (existing is not null)
        {
            var changed = false;
            if (isAdmin && !existing.IsAdmin)
            {
                existing.IsAdmin = true;
                changed = true;
            }

            if (onboardingCompleted is true && !existing.OnboardingCompleted)
            {
                existing.OnboardingCompleted = true;
                changed = true;
            }

            if (string.IsNullOrWhiteSpace(existing.FirstName) && !string.IsNullOrWhiteSpace(firstName))
            {
                existing.FirstName = firstName;
                changed = true;
            }

            if (string.IsNullOrWhiteSpace(existing.LastName) && !string.IsNullOrWhiteSpace(lastName))
            {
                existing.LastName = lastName;
                changed = true;
            }

            if (changed)
                await db.SaveChangesAsync(cancellationToken);

            return existing;
        }

        var user = new AppUser
        {
            Id = userId,
            Email = email,
            FirstName = firstName,
            LastName = lastName,
            CreatedAtUtc = DateTime.UtcNow,
            OnboardingCompleted = onboardingCompleted ?? false,
            IsAdmin = isAdmin,
        };

        db.Users.Add(user);
        await db.SaveChangesAsync(cancellationToken);
        return user;
    }
}
