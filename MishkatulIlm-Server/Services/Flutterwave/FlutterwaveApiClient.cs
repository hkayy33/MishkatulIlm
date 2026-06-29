using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MishkatulIlm_Server.Options;

namespace MishkatulIlm_Server.Services.Flutterwave;

public sealed class FlutterwaveApiClient(
    IHttpClientFactory httpClientFactory,
    IOptions<FlutterwaveOptions> options,
    ILogger<FlutterwaveApiClient> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly SemaphoreSlim _tokenLock = new(1, 1);
    private string? _accessToken;
    private DateTime _accessTokenExpiresUtc = DateTime.MinValue;

    public async Task<JsonDocument> PostAsync(
        string path,
        object body,
        string traceId,
        string? idempotencyKey = null,
        CancellationToken cancellationToken = default)
    {
        var token = await GetAccessTokenAsync(cancellationToken);
        using var request = new HttpRequestMessage(HttpMethod.Post, BuildUrl(path));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.Add("X-Trace-Id", traceId);
        if (!string.IsNullOrWhiteSpace(idempotencyKey))
            request.Headers.Add("X-Idempotency-Key", idempotencyKey);

        var json = JsonSerializer.Serialize(body, JsonOptions);
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");

        return await SendAsync(request, cancellationToken);
    }

    public async Task<JsonDocument> GetAsync(
        string path,
        string traceId,
        CancellationToken cancellationToken = default)
    {
        var token = await GetAccessTokenAsync(cancellationToken);
        using var request = new HttpRequestMessage(HttpMethod.Get, BuildUrl(path));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.Add("X-Trace-Id", traceId);
        return await SendAsync(request, cancellationToken);
    }

    private async Task<string> GetAccessTokenAsync(CancellationToken cancellationToken)
    {
        if (_accessToken is not null && DateTime.UtcNow < _accessTokenExpiresUtc.AddMinutes(-1))
            return _accessToken;

        await _tokenLock.WaitAsync(cancellationToken);
        try
        {
            if (_accessToken is not null && DateTime.UtcNow < _accessTokenExpiresUtc.AddMinutes(-1))
                return _accessToken;

            var opts = options.Value;
            using var request = new HttpRequestMessage(HttpMethod.Post, opts.TokenUrl)
            {
                Content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["client_id"] = opts.ClientId,
                    ["client_secret"] = opts.ClientSecret,
                    ["grant_type"] = "client_credentials",
                }),
            };

            var client = httpClientFactory.CreateClient(nameof(FlutterwaveApiClient));
            using var response = await client.SendAsync(request, cancellationToken);
            var payload = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogError("Flutterwave token request failed ({Status}): {Body}", response.StatusCode, payload);
                throw new InvalidOperationException("Could not authenticate with Flutterwave.");
            }

            using var doc = JsonDocument.Parse(payload);
            var root = doc.RootElement;
            _accessToken = root.GetProperty("access_token").GetString()
                ?? throw new InvalidOperationException("Flutterwave token response missing access_token.");
            var expiresIn = root.TryGetProperty("expires_in", out var expiresEl) ? expiresEl.GetInt32() : 600;
            _accessTokenExpiresUtc = DateTime.UtcNow.AddSeconds(Math.Max(60, expiresIn));
            return _accessToken;
        }
        finally
        {
            _tokenLock.Release();
        }
    }

    private async Task<JsonDocument> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient(nameof(FlutterwaveApiClient));
        using var response = await client.SendAsync(request, cancellationToken);
        var payload = await response.Content.ReadAsStringAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(payload))
        {
            if (!response.IsSuccessStatusCode)
            {
                throw new FlutterwaveApiException(
                    $"Flutterwave API returned {(int)response.StatusCode} with an empty body.",
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
                "Flutterwave API {Method} {Path} returned non-JSON ({Status}): {Body}",
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
                ?? $"Flutterwave API request failed ({(int)response.StatusCode}).";
            logger.LogWarning(
                "Flutterwave API {Method} {Path} failed ({Status}): {Body}",
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
        if (root.TryGetProperty("error", out var error) && error.TryGetProperty("message", out var message))
            return message.GetString();
        if (root.TryGetProperty("message", out var topMessage))
            return topMessage.GetString();
        return null;
    }

    private string BuildUrl(string path)
    {
        var baseUrl = options.Value.ApiBaseUrl.TrimEnd('/');
        return path.StartsWith('/') ? $"{baseUrl}{path}" : $"{baseUrl}/{path}";
    }
}
