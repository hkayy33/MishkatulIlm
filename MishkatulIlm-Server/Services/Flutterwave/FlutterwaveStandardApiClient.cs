using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MishkatulIlm_Server.Options;

namespace MishkatulIlm_Server.Services.Flutterwave;

public sealed class FlutterwaveStandardApiClient(
    IHttpClientFactory httpClientFactory,
    IOptions<FlutterwaveOptions> options,
    ILogger<FlutterwaveStandardApiClient> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public async Task<JsonDocument> PostAsync(string path, object body, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, BuildUrl(path));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.SecretKey);
        request.Content = new StringContent(
            JsonSerializer.Serialize(body, JsonOptions),
            Encoding.UTF8,
            "application/json");

        return await SendAsync(request, cancellationToken);
    }

    public async Task<JsonDocument> GetAsync(string path, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, BuildUrl(path));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.SecretKey);
        return await SendAsync(request, cancellationToken);
    }

    private async Task<JsonDocument> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient(nameof(FlutterwaveStandardApiClient));
        using var response = await client.SendAsync(request, cancellationToken);
        var payload = await response.Content.ReadAsStringAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(payload))
        {
            if (!response.IsSuccessStatusCode)
            {
                throw new FlutterwaveApiException(
                    $"Flutterwave Standard API returned {(int)response.StatusCode} with an empty body.",
                    (int)response.StatusCode);
            }

            payload = "{}";
        }

        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(payload);
        }
        catch (JsonException ex)
        {
            logger.LogError(
                ex,
                "Flutterwave Standard API {Method} {Path} returned non-JSON ({Status}): {Body}",
                request.Method,
                request.RequestUri,
                response.StatusCode,
                payload);
            throw new FlutterwaveApiException(
                "Flutterwave returned an unexpected response.",
                (int)response.StatusCode);
        }

        if (!response.IsSuccessStatusCode)
        {
            var message = TryReadErrorMessage(doc.RootElement)
                ?? $"Flutterwave Standard API request failed ({(int)response.StatusCode}).";
            logger.LogWarning(
                "Flutterwave Standard API {Method} {Path} failed ({Status}): {Body}",
                request.Method,
                request.RequestUri,
                response.StatusCode,
                payload);
            throw new FlutterwaveApiException(message, (int)response.StatusCode);
        }

        return doc;
    }

    private static string? TryReadErrorMessage(JsonElement root)
    {
        if (root.TryGetProperty("message", out var topMessage))
            return topMessage.GetString();
        return null;
    }

    private string BuildUrl(string path)
    {
        var baseUrl = options.Value.StandardApiBaseUrl.TrimEnd('/');
        return path.StartsWith('/') ? $"{baseUrl}{path}" : $"{baseUrl}/{path}";
    }
}
