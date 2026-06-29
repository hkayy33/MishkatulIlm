namespace MishkatulIlm_Server.Services.Flutterwave;

public sealed class FlutterwaveApiException(string message, int? statusCode = null) : Exception(message)
{
    public int? StatusCode { get; } = statusCode;
}
