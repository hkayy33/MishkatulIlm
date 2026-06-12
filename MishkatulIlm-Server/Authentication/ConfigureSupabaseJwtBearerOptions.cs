using System.IdentityModel.Tokens.Jwt;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using MishkatulIlm_Server.Options;
using MishkatulIlm_Server.Services;

namespace MishkatulIlm_Server.Authentication;

/// <summary>
/// Runs as <see cref="IPostConfigureOptions{TOptions}"/> so settings apply after ASP.NET Core's
/// default JwtBearer configuration (which can otherwise set ValidIssuer and reject Supabase tokens).
/// </summary>
public sealed class ConfigureSupabaseJwtBearerOptions(
    SupabaseJwtKeyProvider keyProvider,
    IOptions<SupabaseAuthOptions> supabaseOptions,
    IConfiguration configuration,
    ILogger<ConfigureSupabaseJwtBearerOptions> logger) : IPostConfigureOptions<JwtBearerOptions>
{
    public void PostConfigure(string? name, JwtBearerOptions options)
    {
        if (name is not null && name != JwtBearerDefaults.AuthenticationScheme)
            return;

        var supabaseUrl = ResolveSupabaseProjectUrl();
        var expectedIssuer = $"{supabaseUrl}/auth/v1";

        options.Authority = null;
        options.RequireHttpsMetadata = false;

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(2),
            TryAllIssuerSigningKeys = true,
            ValidIssuer = expectedIssuer,
            ValidIssuers = [expectedIssuer],
            ValidAudience = null,
            AudienceValidator = (audiences, _, _) => HasAuthenticatedAudience(audiences),
            IssuerSigningKeyResolver = (_, securityToken, kid, _) =>
                ResolveSigningKeys(securityToken, kid, supabaseOptions.Value.JwtSecret),
        };

        options.MapInboundClaims = true;

        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = context =>
            {
                JwtDiagnostics.TryLogBearerDiagnostics(logger, context.Request.Headers.Authorization.ToString());
                logger.LogWarning(
                    context.Exception,
                    "JWT rejected for {Path}. Expected issuer {Issuer} (Supabase:Url {BaseUrl}).",
                    context.Request.Path,
                    expectedIssuer,
                    supabaseUrl);
                return Task.CompletedTask;
            },
        };
    }

    private string ResolveSupabaseProjectUrl()
    {
        var fromSection = SupabaseUrlNormalizer.NormalizeProjectUrl(supabaseOptions.Value.Url);
        var fromConfig = SupabaseUrlNormalizer.NormalizeProjectUrl(configuration["Supabase:Url"]);
        var supabaseUrl = !string.IsNullOrEmpty(fromSection) ? fromSection : fromConfig;

        if (string.IsNullOrEmpty(supabaseUrl))
        {
            throw new InvalidOperationException(
                "Supabase:Url is not configured. Set it to your project root (e.g. https://xxxx.supabase.co).");
        }

        return supabaseUrl;
    }

    private static bool HasAuthenticatedAudience(IEnumerable<string>? audiences)
    {
        if (audiences is null)
            return false;
        foreach (var a in audiences)
        {
            if (string.Equals(a, "authenticated", StringComparison.Ordinal))
                return true;
        }

        return false;
    }

    private IEnumerable<SecurityKey> ResolveSigningKeys(
        SecurityToken securityToken,
        string? kid,
        string? legacyJwtSecret)
    {
        string? alg;
        string? headerKidFromToken;

        switch (securityToken)
        {
            case JwtSecurityToken jwt:
                alg = jwt.Header.Alg;
                headerKidFromToken = jwt.Header.Kid ?? kid;
                break;
            case JsonWebToken jwt:
                alg = jwt.Alg;
                headerKidFromToken = jwt.Kid ?? kid;
                break;
            default:
                return [];
        }

        if (string.Equals(alg, "HS256", StringComparison.Ordinal))
        {
            if (string.IsNullOrWhiteSpace(legacyJwtSecret))
            {
                logger.LogDebug("HS256 token but Supabase:JwtSecret is empty; cannot resolve signing key.");
                return [];
            }

            return [new SymmetricSecurityKey(Encoding.UTF8.GetBytes(legacyJwtSecret))];
        }

        var jwksKeys = keyProvider.GetJwksSigningKeys();
        if (jwksKeys.Count == 0)
            return [];

        var headerKid = headerKidFromToken;
        if (!string.IsNullOrEmpty(headerKid))
        {
            var matched = jwksKeys
                .Where(k => string.Equals(k.KeyId, headerKid, StringComparison.OrdinalIgnoreCase))
                .ToArray();
            if (matched.Length > 0)
                return matched;
        }

        return jwksKeys;
    }
}

internal static class JwtDiagnostics
{
    public static void TryLogBearerDiagnostics(ILogger logger, string authorizationHeader)
    {
        if (string.IsNullOrWhiteSpace(authorizationHeader) ||
            !authorizationHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            logger.LogWarning("JWT auth failed but Authorization header is missing or not Bearer.");
            return;
        }

        var jwt = authorizationHeader["Bearer ".Length..].Trim();
        var parts = jwt.Split('.');
        if (parts.Length < 2)
        {
            logger.LogWarning("JWT auth failed: Bearer value is not a JWT.");
            return;
        }

        var alg = TryReadAlg(parts[0]);
        var (iss, aud) = TryReadIssAud(parts[1]);
        logger.LogWarning(
            "JWT (unverified) header.alg={HeaderAlg} payload.iss={Iss} payload.aud={Aud}",
            alg,
            iss,
            aud);
    }

    private static string? TryReadAlg(string headerB64Url)
    {
        try
        {
            var json = Encoding.UTF8.GetString(Base64UrlDecode(headerB64Url));
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.TryGetProperty("alg", out var a) ? a.GetString() : null;
        }
        catch
        {
            return null;
        }
    }

    private static (string? Iss, string? Aud) TryReadIssAud(string payloadB64Url)
    {
        try
        {
            var json = Encoding.UTF8.GetString(Base64UrlDecode(payloadB64Url));
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var iss = root.TryGetProperty("iss", out var i) ? i.GetString() : null;
            string? aud = null;
            if (root.TryGetProperty("aud", out var audEl))
            {
                aud = audEl.ValueKind switch
                {
                    JsonValueKind.String => audEl.GetString(),
                    JsonValueKind.Array => string.Join(
                        ", ",
                        audEl.EnumerateArray().Select(e => e.ValueKind == JsonValueKind.String ? e.GetString() : e.ToString())),
                    _ => audEl.ToString(),
                };
            }

            return (iss, aud);
        }
        catch
        {
            return (null, null);
        }
    }

    private static byte[] Base64UrlDecode(string input)
    {
        var s = input.Replace('-', '+').Replace('_', '/');
        switch (s.Length % 4)
        {
            case 2: s += "=="; break;
            case 3: s += "="; break;
        }

        return Convert.FromBase64String(s);
    }
}
