using Microsoft.EntityFrameworkCore;

namespace MishkatulIlm_Server.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<StudentOnboardingProfile> StudentOnboardingProfiles => Set<StudentOnboardingProfile>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.Email).IsUnique();
            entity.Property(e => e.Email).HasMaxLength(320).IsRequired();
            entity.Property(e => e.FirstName).HasMaxLength(120).IsRequired();
            entity.Property(e => e.LastName).HasMaxLength(120).IsRequired();
            entity.HasOne(e => e.Onboarding)
                .WithOne(e => e.User)
                .HasForeignKey<StudentOnboardingProfile>(e => e.UserId);
        });

        modelBuilder.Entity<StudentOnboardingProfile>(entity =>
        {
            entity.ToTable("student_onboarding_profiles");
            entity.HasKey(e => e.UserId);
            entity.Property(e => e.AgeRange).HasMaxLength(64).IsRequired();
            entity.Property(e => e.Gender).HasMaxLength(64).IsRequired();
            entity.Property(e => e.CurrentLevel).HasMaxLength(64).IsRequired();
            entity.Property(e => e.LessonFrequency).HasMaxLength(64).IsRequired();
            entity.Property(e => e.SubjectCodes).HasColumnType("jsonb").IsRequired();
        });
    }
}
