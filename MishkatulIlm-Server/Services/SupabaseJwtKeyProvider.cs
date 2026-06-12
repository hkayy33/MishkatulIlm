using System.Collections.Concurrent;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using MishkatulIlm_Server.Options;

namespace MishkatulIlm_Server.Services;

/// <summary>Fetches and caches Supabase <c>/.well-known/jwks.json</c> for asymmetric (e.g. ES256) access tokens.</summary>
public sealed class SupabaseJwtKeyProvider(
    IHttpClientFactory httpClientFactory,
    IOptionsMonitor<SupabaseAuthOptions> options,
    ILogger<SupabaseJwtKeyProvider> logger)
{
    private readonly object _gate = new();
    private JsonWebKeySet? _jwks;
    private DateTimeOffset _lastFetchUtc;

    public DateTimeOffset LastFetchUtc
    {
        get
        {
            lock (_gate)
                return _lastFetchUtc;
        }
    }

    public bool HasJwksKeys
    {
        get
        {
            lock (_gate)
                return _jwks?.GetSigningKeys().Count > 0;
        }
    }

    public async Task RefreshAsync(CancellationToken cancellationToken)
    {
        var url = SupabaseUrlNormalizer.NormalizeProjectUrl(options.CurrentValue.Url);
        if (string.IsNullOrWhiteSpace(url))
            return;

        var jwksUrl = $"{url}/auth/v1/.well-known/jwks.json";
        try
        {
            var client = httpClientFactory.CreateClient(nameof(SupabaseJwtKeyProvider));
            var json = await client.GetStringAsync(jwksUrl, cancellationToken).ConfigureAwait(false);
            var jwks = JsonWebKeySet.Create(json);
            lock (_gate)
            {
                _jwks = jwks;
                _lastFetchUtc = DateTimeOffset.UtcNow;
            }

            var count = jwks.GetSigningKeys().Count;
            logger.LogInformation("Loaded {Count} signing key(s) from Supabase JWKS.", count);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to fetch Supabase JWKS from {JwksUrl}", jwksUrl);
        }
    }

    public IReadOnlyList<SecurityKey> GetJwksSigningKeys()
    {
        lock (_gate)
        {
            if (_jwks is null)
                return [];
            return _jwks.GetSigningKeys().ToList();
        }
    }
}
