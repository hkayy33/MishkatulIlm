namespace MishkatulIlm_Server.Data;

public static class ScheduleProposalCodes
{
    public const string AwaitingStudent = "AWAITING_STUDENT";
    public const string StudentAmended = "STUDENT_AMENDED";
    public const string Accepted = "ACCEPTED";
    public const string Superseded = "SUPERSEDED";

    public static bool IsOpen(string status) =>
        status is AwaitingStudent or StudentAmended;
}
