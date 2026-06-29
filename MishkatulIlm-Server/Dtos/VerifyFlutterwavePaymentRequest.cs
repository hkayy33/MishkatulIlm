namespace MishkatulIlm_Server.Dtos;

public sealed class VerifyFlutterwavePaymentRequest
{
    public string Reference { get; set; } = string.Empty;
    public string? TransactionId { get; set; }
}
