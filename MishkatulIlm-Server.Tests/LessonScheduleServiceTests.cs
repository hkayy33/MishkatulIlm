using MishkatulIlm_Server.Dtos;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Services;
using Xunit;

namespace MishkatulIlm_Server.Tests;

/// <summary>
/// Lessons are booked in fixed 4-week blocks. When a block ends, rollover plans the next block
/// from the same week-one pattern (see <see cref="LessonScheduleService.PlanRolloverBlock"/>).
/// </summary>
public sealed class LessonScheduleServiceTests
{
  private static readonly DateTime WeekOneStart =
    new(2026, 6, 2, 10, 0, 0, DateTimeKind.Utc); // Tuesday 10:00 UTC

  [Fact]
  public void BookingWeeks_is_four_weeks_not_a_calendar_month()
  {
    Assert.Equal(4, LessonScheduleService.BookingWeeks);
  }

  [Fact]
  public void PlanFromWeekOneLessons_once_weekly_creates_exactly_four_lessons()
  {
    var planned = PlanOnceWeekly();

    Assert.Equal(4, planned.Count);
  }

  [Fact]
  public void PlanFromWeekOneLessons_once_weekly_spans_weeks_zero_through_three_only()
  {
    var planned = PlanOnceWeekly();
    var weekOffsets = planned
      .Select(l => (l.StartsAtUtc.Date - WeekOneStart.Date).TotalDays / 7)
      .OrderBy(d => d)
      .ToList();

    Assert.Equal([0d, 1d, 2d, 3d], weekOffsets);
  }

  [Fact]
  public void PlanFromWeekOneLessons_once_weekly_does_not_include_a_fifth_week()
  {
    var planned = PlanOnceWeekly();
    var lastStart = planned.Max(l => l.StartsAtUtc);

    Assert.Equal(WeekOneStart.AddDays(21), lastStart);
    Assert.DoesNotContain(planned, l => l.StartsAtUtc >= WeekOneStart.AddDays(28));
  }

  [Fact]
  public void PlanFromWeekOneLessons_twice_weekly_creates_eight_lessons_over_four_weeks()
  {
    var weekOne = new List<WeekOneLessonSlotDto>
    {
      new() { StartsAtUtc = WeekOneStart, DurationMinutes = 60 },
      new() { StartsAtUtc = WeekOneStart.AddDays(2), DurationMinutes = 60 },
    };

    var planned = LessonScheduleService.PlanFromWeekOneLessons(weekOne, "TWICE-WEEK");

    Assert.Equal(8, planned.Count);
    Assert.Equal(WeekOneStart.AddDays(23), planned.Max(l => l.StartsAtUtc));
    Assert.DoesNotContain(planned, l => l.StartsAtUtc >= WeekOneStart.AddDays(28));
  }

  [Fact]
  public void PlanFromWeekOneLessons_biweekly_skips_alternate_weeks_within_the_block()
  {
    var planned = LessonScheduleService.PlanFromWeekOneLessons(
      [new WeekOneLessonSlotDto { StartsAtUtc = WeekOneStart, DurationMinutes = 60 }],
      "BIWEEKLY");

    Assert.Equal(2, planned.Count);
    Assert.Equal(WeekOneStart, planned[0].StartsAtUtc);
    Assert.Equal(WeekOneStart.AddDays(14), planned[1].StartsAtUtc);
  }

  [Fact]
  public void PlanRolloverBlock_once_weekly_starts_four_weeks_after_previous_block()
  {
    var previousBlock = PlanOnceWeekly();
    var weekOne = LessonScheduleService.ExtractWeekOneLessonsFromLastBlock(
      previousBlock.Select(l => (l.StartsAtUtc, l.EndsAtUtc)).ToList());

    var rollover = LessonScheduleService.PlanRolloverBlock(weekOne, "ONCE-WEEK");

    Assert.Equal(4, rollover.Count);
    Assert.Equal(WeekOneStart.AddDays(28), rollover[0].StartsAtUtc);
    Assert.Equal(WeekOneStart.AddDays(49), rollover.Max(l => l.StartsAtUtc));
  }

  [Fact]
  public void ExtractWeekOneLessonsFromLastBlock_reads_templates_from_first_week_of_block()
  {
    var previousBlock = PlanOnceWeekly();
    var weekOne = LessonScheduleService.ExtractWeekOneLessonsFromLastBlock(
      previousBlock.Select(l => (l.StartsAtUtc, l.EndsAtUtc)).ToList());

    Assert.Single(weekOne);
    Assert.Equal(WeekOneStart, weekOne[0].StartsAtUtc);
    Assert.Equal(60, weekOne[0].DurationMinutes);
  }

  [Fact]
  public void BillingMonthForLessonStart_uses_calendar_month_of_first_lesson()
  {
    var start = new DateTime(2026, 8, 4, 10, 0, 0, DateTimeKind.Utc);
    var (year, month) = LessonBillingService.BillingMonthForLessonStart(start);

    Assert.Equal(2026, year);
    Assert.Equal(8, month);
  }

  [Fact]
  public void IsBillingPeriodPaid_returns_true_when_period_is_in_paid_set()
  {
    var paid = new HashSet<(int Year, int Month)> { (2026, 8) };

    Assert.True(LessonBillingService.IsBillingPeriodPaid(2026, 8, paid));
    Assert.False(LessonBillingService.IsBillingPeriodPaid(2026, 9, paid));
  }

  [Fact]
  public void FormatRolloverBillingPeriod_spans_months_when_block_crosses_calendar_months()
  {
    var planned = LessonScheduleService.PlanRolloverBlock(
      [new WeekOneLessonSlotDto { StartsAtUtc = new DateTime(2026, 6, 16, 10, 0, 0, DateTimeKind.Utc), DurationMinutes = 60 }],
      "ONCE-WEEK");

    var label = LessonBillingService.FormatRolloverBillingPeriod(planned);

    Assert.StartsWith("Next 4-week block (", label);
    Assert.Contains("Jul", label);
    Assert.Equal(4, planned.Count);
  }

  [Fact]
  public void BuildStatement_bills_entire_rollover_block_not_single_calendar_month()
  {
    var planned = LessonScheduleService.PlanRolloverBlock(
      [new WeekOneLessonSlotDto { StartsAtUtc = new DateTime(2026, 6, 16, 10, 0, 0, DateTimeKind.Utc), DurationMinutes = 60 }],
      "ONCE-WEEK");
    var lessons = LessonBillingService.SyntheticSlotsFromPlanned(planned);
    var user = new AppUser
    {
      Id = Guid.NewGuid(),
      Email = "student@example.com",
      FirstName = "Test",
      LastName = "Student",
    };
    var settings = new SchedulingSettings
    {
        PaymentRate45MinUsd = 5m,
        PaymentRate60MinUsd = 7m,
    };

    var statement = LessonBillingService.BuildStatement(
      user,
      lessons,
      settings,
      billingYear: 2026,
      billingMonth: 6,
      currentSubmission: null,
      utcNow: new DateTime(2026, 6, 10, 0, 0, 0, DateTimeKind.Utc),
      billingPeriodLabelOverride: LessonBillingService.FormatRolloverBillingPeriod(planned),
      billEntireLessonList: true);

    Assert.Equal(4, statement.Lessons.Count);
    Assert.Equal(28m, statement.TotalAmount);
    Assert.All(statement.Lessons, line => Assert.Equal(7m, line.Amount));
  }

  [Fact]
  public void BuildStatement_excludes_not_attending_lessons_from_total()
  {
    var user = new AppUser
    {
      Id = Guid.NewGuid(),
      Email = "student@example.com",
      FirstName = "Test",
      LastName = "Student",
    };
    var settings = new SchedulingSettings { PaymentRate45MinUsd = 5m, PaymentRate60MinUsd = 7m };
    var lessons = new List<LessonSlot>
    {
      new()
      {
        Id = Guid.NewGuid(),
        StartsAtUtc = new DateTime(2026, 6, 5, 10, 0, 0, DateTimeKind.Utc),
        EndsAtUtc = new DateTime(2026, 6, 5, 11, 0, 0, DateTimeKind.Utc),
        AttendanceStatus = AttendanceStatusCodes.Attending,
      },
      new()
      {
        Id = Guid.NewGuid(),
        StartsAtUtc = new DateTime(2026, 6, 12, 10, 0, 0, DateTimeKind.Utc),
        EndsAtUtc = new DateTime(2026, 6, 12, 11, 0, 0, DateTimeKind.Utc),
        AttendanceStatus = AttendanceStatusCodes.NotAttending,
      },
      new()
      {
        Id = Guid.NewGuid(),
        StartsAtUtc = new DateTime(2026, 6, 19, 10, 0, 0, DateTimeKind.Utc),
        EndsAtUtc = new DateTime(2026, 6, 19, 11, 0, 0, DateTimeKind.Utc),
        AttendanceStatus = AttendanceStatusCodes.Attending,
      },
    };

    var statement = LessonBillingService.BuildStatement(
      user,
      lessons,
      settings,
      billingYear: 2026,
      billingMonth: 6,
      currentSubmission: null,
      utcNow: new DateTime(2026, 6, 20, 0, 0, 0, DateTimeKind.Utc));

    Assert.Equal(2, statement.Lessons.Count);
    Assert.Equal(14m, statement.TotalAmount);
    Assert.DoesNotContain(
      statement.Lessons,
      line => line.StartsAtUtc == new DateTime(2026, 6, 12, 10, 0, 0, DateTimeKind.Utc));
  }

  [Theory]
  [InlineData("NOT_ATTENDING")]
  [InlineData("not_attending")]
  [InlineData("ABSENT")]
  public void IsBillableAttendance_returns_false_for_not_attending(string status)
  {
    Assert.False(LessonBillingService.IsBillableAttendance(status));
  }

  [Fact]
  public void PriceLesson_uses_flat_rates_for_45_and_60_minutes()
  {
    var (amount45, rate45, label45) = LessonBillingService.PriceLesson(45, 5m, 7m);
    var (amount60, rate60, label60) = LessonBillingService.PriceLesson(60, 5m, 7m);

    Assert.Equal(5m, amount45);
    Assert.Equal(5m, rate45);
    Assert.Equal("45 min lesson", label45);
    Assert.Equal(7m, amount60);
    Assert.Equal(7m, rate60);
    Assert.Equal("1 hour lesson", label60);
  }

  private static List<PlannedLessonSlotDto> PlanOnceWeekly() =>
    LessonScheduleService.PlanFromWeekOneLessons(
      [new WeekOneLessonSlotDto { StartsAtUtc = WeekOneStart, DurationMinutes = 60 }],
      "ONCE-WEEK");
}
