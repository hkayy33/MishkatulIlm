namespace MishkatulIlm_Server.Dtos;

public sealed class PaymentLessonLineItemDto
{
    public Guid SlotId { get; init; }
    public DateTime StartsAtUtc { get; init; }
    public DateTime EndsAtUtc { get; init; }
    public int DurationMinutes { get; init; }
    public decimal LessonRate { get; init; }
    public decimal HourlyRate { get; init; }
    public string RateLabel { get; init; } = string.Empty;
    public decimal Amount { get; init; }
}

public sealed class PaymentStatementDto
{
    public string StudentName { get; init; } = string.Empty;
    public string PaymentReference { get; init; } = string.Empty;
    public int BillingYear { get; init; }
    public int BillingMonth { get; init; }
    public string BillingPeriodLabel { get; init; } = string.Empty;
    public DateTime? PaymentDueUtc { get; init; }
    public bool ShowPaymentReminder { get; init; }
    public int? DaysUntilDue { get; init; }
    public decimal Rate45MinUsd { get; init; }
    public decimal Rate60MinUsd { get; init; }
    public decimal HourlyRate { get; init; }
    public string Currency { get; init; } = "USD";
    public decimal TotalAmount { get; init; }
    public IReadOnlyList<PaymentLessonLineItemDto> Lessons { get; init; } = Array.Empty<PaymentLessonLineItemDto>();
    public string AccountName { get; init; } = string.Empty;
    public string AccountNumber { get; init; } = string.Empty;
    public string SortCode { get; init; } = string.Empty;
    public string BankName { get; init; } = string.Empty;
    public string PaymentInstructions { get; init; } = string.Empty;
    public string? CurrentSubmissionStatus { get; init; }
    public Guid? CurrentSubmissionId { get; init; }
    public DateTime? CurrentSubmissionSubmittedAtUtc { get; init; }
}

public sealed class AdminPaymentSubmissionListItemDto
{
    public Guid Id { get; init; }
    public Guid StudentUserId { get; init; }
    public string StudentName { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public int BillingYear { get; init; }
    public int BillingMonth { get; init; }
    public string BillingPeriodLabel { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public decimal Amount { get; init; }
    public string Currency { get; init; } = "USD";
    public string PaymentReference { get; init; } = string.Empty;
    public DateTime SubmittedAtUtc { get; init; }
    public DateTime? ReviewedAtUtc { get; init; }
    public string? AdminNote { get; init; }
    public IReadOnlyList<PaymentLessonLineItemDto> Lessons { get; init; } = Array.Empty<PaymentLessonLineItemDto>();
}

public sealed class ReviewPaymentSubmissionRequest
{
    public string? AdminNote { get; set; }
}

public sealed class StudentPaymentHistoryItemDto
{
    public Guid Id { get; init; }
    public int BillingYear { get; init; }
    public int BillingMonth { get; init; }
    public string BillingPeriodLabel { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public decimal Amount { get; init; }
    public string Currency { get; init; } = "USD";
    public DateTime SubmittedAtUtc { get; init; }
    public DateTime? ReviewedAtUtc { get; init; }
}
