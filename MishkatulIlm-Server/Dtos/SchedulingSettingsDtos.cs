namespace MishkatulIlm_Server.Dtos;

public sealed class SchedulingSettingsDto
{
    public string TutorDisplayName { get; init; } = "Tutor";
    public string TutorCountry { get; init; } = string.Empty;
    public string TutorCity { get; init; } = string.Empty;
    public string TutorTimeZoneId { get; init; } = "UTC";
    public decimal PaymentHourlyRateUsd { get; init; } = 7m;
    public decimal PaymentRate45MinUsd { get; init; } = 5m;
    public decimal PaymentRate60MinUsd { get; init; } = 7m;
    public string PaymentAccountName { get; init; } = string.Empty;
    public string PaymentAccountNumber { get; init; } = string.Empty;
    public string PaymentSortCode { get; init; } = string.Empty;
    public string PaymentBankName { get; init; } = string.Empty;
    public string PaymentInstructions { get; init; } = string.Empty;
}

public sealed class UpdateSchedulingSettingsRequest
{
    public string TutorDisplayName { get; set; } = "Tutor";
    public string TutorCountry { get; set; } = string.Empty;
    public string TutorCity { get; set; } = string.Empty;
    public string TutorTimeZoneId { get; set; } = "UTC";
    public decimal PaymentHourlyRateUsd { get; set; } = 7m;
    public decimal PaymentRate45MinUsd { get; set; } = 5m;
    public decimal PaymentRate60MinUsd { get; set; } = 7m;
    public string PaymentAccountName { get; set; } = string.Empty;
    public string PaymentAccountNumber { get; set; } = string.Empty;
    public string PaymentSortCode { get; set; } = string.Empty;
    public string PaymentBankName { get; set; } = string.Empty;
    public string PaymentInstructions { get; set; } = string.Empty;
}
