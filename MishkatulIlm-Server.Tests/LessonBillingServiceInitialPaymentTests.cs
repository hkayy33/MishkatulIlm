using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Services;
using Xunit;

namespace MishkatulIlm_Server.Tests;

public sealed class LessonBillingServiceInitialPaymentTests
{
    [Fact]
    public void FormatUpcomingLessonsPeriod_spans_multiple_months()
    {
        var lessons = new List<LessonSlot>
        {
            new()
            {
                StartsAtUtc = new DateTime(2026, 6, 30, 10, 0, 0, DateTimeKind.Utc),
                EndsAtUtc = new DateTime(2026, 6, 30, 11, 0, 0, DateTimeKind.Utc),
            },
            new()
            {
                StartsAtUtc = new DateTime(2026, 7, 7, 10, 0, 0, DateTimeKind.Utc),
                EndsAtUtc = new DateTime(2026, 7, 7, 11, 0, 0, DateTimeKind.Utc),
            },
        };

        var label = LessonBillingService.FormatUpcomingLessonsPeriod(lessons);

        Assert.Equal("Scheduled lessons (30 Jun – 07 Jul 2026)", label);
    }

    [Fact]
    public void BuildStatement_bills_all_upcoming_lessons_for_initial_payment()
    {
        var user = new AppUser
        {
            FirstName = "Hassan",
            LastName = "K",
            LastPaymentAtUtc = null,
        };
        var settings = new SchedulingSettings();
        var lessons = new List<LessonSlot>
        {
            new()
            {
                Id = Guid.NewGuid(),
                StartsAtUtc = new DateTime(2026, 7, 2, 10, 0, 0, DateTimeKind.Utc),
                EndsAtUtc = new DateTime(2026, 7, 2, 11, 0, 0, DateTimeKind.Utc),
            },
            new()
            {
                Id = Guid.NewGuid(),
                StartsAtUtc = new DateTime(2026, 7, 9, 10, 0, 0, DateTimeKind.Utc),
                EndsAtUtc = new DateTime(2026, 7, 9, 11, 0, 0, DateTimeKind.Utc),
            },
        };

        var statement = LessonBillingService.BuildStatement(
            user,
            lessons,
            settings,
            billingYear: 2026,
            billingMonth: 7,
            currentSubmission: null,
            utcNow: new DateTime(2026, 6, 29, 12, 0, 0, DateTimeKind.Utc),
            billingPeriodLabelOverride: LessonBillingService.FormatUpcomingLessonsPeriod(lessons),
            billEntireLessonList: true);

        Assert.Equal(2, statement.Lessons.Count);
        Assert.Equal(14m, statement.TotalAmount);
        Assert.Contains("Scheduled lessons", statement.BillingPeriodLabel);
    }
}
