using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Services;
using Xunit;

namespace MishkatulIlm_Server.Tests;

public sealed class StudentPaymentSummaryBuilderTests
{
    private static AppUser ActiveStudent(DateTime? lastPaymentAtUtc = null) => new()
    {
        Id = Guid.NewGuid(),
        Email = "student@test.local",
        ApplicationStatus = ApplicationStatusCodes.Active,
        LastPaymentAtUtc = lastPaymentAtUtc,
    };

    [Fact]
    public void RequiresInitialPayment_when_student_has_never_paid()
    {
        var utcNow = new DateTime(2026, 6, 29, 12, 0, 0, DateTimeKind.Utc);
        var user = ActiveStudent(lastPaymentAtUtc: null);
        user.NextPaymentDueUtc = utcNow.Date.AddDays(3);

        var summary = StudentPaymentSummaryBuilder.Build(user, currentSubmission: null, utcNow: utcNow);

        Assert.True(summary.RequiresInitialPayment);
        Assert.True(summary.ShowPaymentDetails);
        Assert.True(summary.CanSubmitPayment);
        Assert.False(summary.CurrentPeriodPaid);
    }

    [Fact]
    public void Payment_window_closed_when_more_than_five_days_before_due()
    {
        var utcNow = new DateTime(2026, 6, 20, 12, 0, 0, DateTimeKind.Utc);
        var user = ActiveStudent(lastPaymentAtUtc: utcNow.AddMonths(-1));
        user.NextPaymentDueUtc = utcNow.Date.AddDays(10);

        var summary = StudentPaymentSummaryBuilder.Build(user, currentSubmission: null, utcNow: utcNow);

        Assert.False(summary.ShowPaymentDetails);
        Assert.False(summary.CanSubmitPayment);
        Assert.False(summary.ShowPaymentReminder);
    }

    [Fact]
    public void Payment_window_open_within_five_days_of_due_date()
    {
        var utcNow = new DateTime(2026, 6, 29, 12, 0, 0, DateTimeKind.Utc);
        var user = ActiveStudent(lastPaymentAtUtc: utcNow.AddMonths(-1));
        user.NextPaymentDueUtc = utcNow.Date.AddDays(3);

        var summary = StudentPaymentSummaryBuilder.Build(user, currentSubmission: null, utcNow: utcNow);

        Assert.True(summary.ShowPaymentDetails);
        Assert.True(summary.CanSubmitPayment);
        Assert.True(summary.ShowPaymentReminder);
        Assert.Equal(3, summary.DaysUntilDue);
    }

    [Fact]
    public void PendingVerification_shows_details_but_blocks_new_submission()
    {
        var utcNow = new DateTime(2026, 6, 29, 12, 0, 0, DateTimeKind.Utc);
        var user = ActiveStudent(lastPaymentAtUtc: utcNow.AddMonths(-1));
        user.NextPaymentDueUtc = utcNow.Date.AddDays(3);
        var submission = new PaymentSubmission
        {
            Status = PaymentSubmissionStatusCodes.PendingVerification,
            BillingYear = 2026,
            BillingMonth = 6,
        };

        var summary = StudentPaymentSummaryBuilder.Build(user, submission, utcNow);

        Assert.True(summary.ShowPaymentDetails);
        Assert.False(summary.CanSubmitPayment);
        Assert.Equal(PaymentSubmissionStatusCodes.PendingVerification, summary.CurrentSubmissionStatus);
    }

    [Fact]
    public void CurrentPeriodPaid_blocks_submission()
    {
        var utcNow = new DateTime(2026, 6, 29, 12, 0, 0, DateTimeKind.Utc);
        var user = ActiveStudent(lastPaymentAtUtc: utcNow.AddMonths(-1));
        user.NextPaymentDueUtc = utcNow.Date.AddDays(3);
        var submission = new PaymentSubmission
        {
            Status = PaymentSubmissionStatusCodes.Paid,
            BillingYear = 2026,
            BillingMonth = 6,
        };

        var summary = StudentPaymentSummaryBuilder.Build(user, submission, utcNow);

        Assert.True(summary.CurrentPeriodPaid);
        Assert.False(summary.CanSubmitPayment);
    }

    [Fact]
    public void PaymentOverdue_when_due_date_passed_and_period_unpaid()
    {
        var utcNow = new DateTime(2026, 7, 5, 12, 0, 0, DateTimeKind.Utc);
        var user = ActiveStudent(lastPaymentAtUtc: utcNow.AddMonths(-2));
        user.NextPaymentDueUtc = utcNow.Date.AddDays(-3);

        var summary = StudentPaymentSummaryBuilder.Build(user, currentSubmission: null, utcNow: utcNow);

        Assert.True(summary.PaymentOverdue);
        Assert.True(summary.ShowPaymentDetails);
        Assert.True(summary.CanSubmitPayment);
    }
}
