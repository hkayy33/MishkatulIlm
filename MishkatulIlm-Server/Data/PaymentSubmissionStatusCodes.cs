namespace MishkatulIlm_Server.Data;

public static class PaymentSubmissionStatusCodes
{
    public const string PendingVerification = "pending_verification";
    public const string Paid = "paid";
    public const string Rejected = "rejected";

    public static bool IsValid(string? status) =>
        status is PendingVerification or Paid or Rejected;
}
