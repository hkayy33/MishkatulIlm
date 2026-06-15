namespace MishkatulIlm_Server.Services;

public enum RolloverOutcome
{
    NotApplicable,
    AwaitingPayment,
    Booked,
    CalendarConflict,
    ValidationFailed,
}

public sealed record RolloverAttemptResult(
    RolloverOutcome Outcome,
    string? Message = null,
    int LessonsBooked = 0)
{
    public static RolloverAttemptResult NotApplicable() => new(RolloverOutcome.NotApplicable);

    public static RolloverAttemptResult AwaitingPayment(string billingPeriod) =>
        new(
            RolloverOutcome.AwaitingPayment,
            $"Payment for {billingPeriod} is required before the next lesson block can be booked.");

    public static RolloverAttemptResult Booked(int count, DateTime firstLessonUtc) =>
        new(
            RolloverOutcome.Booked,
            $"Booked {count} lessons starting {firstLessonUtc:u}.",
            count);

    public static RolloverAttemptResult Conflict(string reason) =>
        new(RolloverOutcome.CalendarConflict, reason);

    public static RolloverAttemptResult Failed(string reason) =>
        new(RolloverOutcome.ValidationFailed, reason);

    public string? UserFacingMessage => Outcome switch
    {
        RolloverOutcome.Booked =>
            LessonsBooked == 1
                ? "Your next lesson block has been booked."
                : $"Your next {LessonsBooked}-lesson block has been booked.",
        RolloverOutcome.AwaitingPayment => Message,
        RolloverOutcome.CalendarConflict =>
            "Your payment was received, but we could not book your next lessons because the usual time slot is no longer available. Please contact support or request a schedule change.",
        RolloverOutcome.ValidationFailed => Message,
        _ => null,
    };

    public string? AdminFacingMessage => Outcome switch
    {
        RolloverOutcome.Booked => Message,
        RolloverOutcome.CalendarConflict => Message,
        RolloverOutcome.ValidationFailed => Message,
        RolloverOutcome.AwaitingPayment => Message,
        _ => null,
    };
}
