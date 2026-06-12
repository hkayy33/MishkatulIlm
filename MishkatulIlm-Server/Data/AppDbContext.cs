using Microsoft.EntityFrameworkCore;

namespace MishkatulIlm_Server.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<StudentOnboardingProfile> StudentOnboardingProfiles => Set<StudentOnboardingProfile>();
    public DbSet<LessonSlot> LessonSlots => Set<LessonSlot>();
    public DbSet<SchedulingSettings> SchedulingSettings => Set<SchedulingSettings>();
    public DbSet<ScheduleProposal> ScheduleProposals => Set<ScheduleProposal>();
    public DbSet<ScheduleChangeRequest> ScheduleChangeRequests => Set<ScheduleChangeRequest>();

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
            entity.Property(e => e.IsAdmin).IsRequired();
            entity.Property(e => e.ApplicationStatus).HasMaxLength(16).IsRequired();
            entity.Property(e => e.LastPaymentCurrency).HasMaxLength(8).IsRequired();
            entity.Property(e => e.LastPaymentAmount).HasPrecision(12, 2);
            entity.Property(e => e.StripeCustomerId).HasMaxLength(255);
            entity.Property(e => e.StripeSubscriptionId).HasMaxLength(255);
            entity.Property(e => e.StripeSubscriptionStatus).HasMaxLength(32);
            entity.Property(e => e.LastStripeInvoiceId).HasMaxLength(255);
            entity.Property(e => e.MessageToTutor).HasMaxLength(2000);
            entity.Property(e => e.ApplicationDeclineMessage).HasMaxLength(2000);
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
            entity.Property(e => e.Country).HasMaxLength(120).IsRequired();
            entity.Property(e => e.City).HasMaxLength(120).IsRequired();
            entity.Property(e => e.PhoneNumber).HasMaxLength(32).IsRequired();
            entity.Property(e => e.CurrentLevel).HasMaxLength(64).IsRequired();
            entity.Property(e => e.LessonFrequency).HasMaxLength(64).IsRequired();
            entity.Property(e => e.SubjectCodes).HasColumnType("jsonb").IsRequired();
            entity.Property(e => e.PreferredAvailability).HasColumnType("jsonb").IsRequired();
        });

        modelBuilder.Entity<LessonSlot>(entity =>
        {
            entity.ToTable("lesson_slots");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.StartsAtUtc);
            entity.HasIndex(e => e.StudentUserId);
            entity.HasOne(e => e.Student)
                .WithMany()
                .HasForeignKey(e => e.StudentUserId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.Property(e => e.AttendanceStatus).HasMaxLength(16).IsRequired();
            entity.Property(e => e.StudentNote).HasMaxLength(2000);
        });

        modelBuilder.Entity<ScheduleChangeRequest>(entity =>
        {
            entity.ToTable("schedule_change_requests");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.StudentUserId);
            entity.Property(e => e.Note).HasMaxLength(4000).IsRequired();
            entity.Property(e => e.Status).HasMaxLength(16).IsRequired();
            entity.Property(e => e.AdminResponseMessage).HasMaxLength(2000);
            entity.HasOne(e => e.Student)
                .WithMany()
                .HasForeignKey(e => e.StudentUserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SchedulingSettings>(entity =>
        {
            entity.ToTable("scheduling_settings");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TutorDisplayName).HasMaxLength(120).IsRequired();
            entity.Property(e => e.TutorCountry).HasMaxLength(120).IsRequired();
            entity.Property(e => e.TutorCity).HasMaxLength(120).IsRequired();
            entity.Property(e => e.TutorTimeZoneId).HasMaxLength(64).IsRequired();
        });

        modelBuilder.Entity<ScheduleProposal>(entity =>
        {
            entity.ToTable("schedule_proposals");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.StudentUserId);
            entity.Property(e => e.Status).HasMaxLength(32).IsRequired();
            entity.Property(e => e.PlannedLessons).HasColumnType("jsonb").IsRequired();
            entity.Property(e => e.StudentAmendNote).HasMaxLength(4000);
            entity.HasOne(e => e.Student)
                .WithMany()
                .HasForeignKey(e => e.StudentUserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
