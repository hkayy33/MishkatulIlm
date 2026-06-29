namespace MishkatulIlm_Server.Data;

public sealed class PaymentSubmission
{
    public Guid Id { get; set; }
    public Guid StudentUserId { get; set; }
    public AppUser? Student { get; set; }

    public int BillingYear { get; set; }
    public int BillingMonth { get; set; }

    public string Status { get; set; } = PaymentSubmissionStatusCodes.PendingVerification;
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "USD";
    public string PaymentReference { get; set; } = string.Empty;

    public DateTime SubmittedAtUtc { get; set; }
    public DateTime? ReviewedAtUtc { get; set; }
    public Guid? ReviewedByAdminUserId { get; set; }
    public string? AdminNote { get; set; }
    public string? FlutterwaveCheckoutSessionId { get; set; }
    public string? FlutterwaveTransactionId { get; set; }
}
