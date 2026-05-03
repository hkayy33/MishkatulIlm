using System.IdentityModel.Tokens.Jwt;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using MishkatulIlm_Server.Options;
using MishkatulIlm_Server.Services;

namespace MishkatulIlm_Server.Authentication;

public sealed class ConfigureSupabaseJwtBearerOptions(
    SupabaseJwtKeyProvider keyProvider,
    IOptions<SupabaseAuthOptions> supabaseOptions) : IConfigureNamedOptions<JwtBearerOptions>
{
    public void Configure(string? name, JwtBearerOptions options)
    {
        if (name is not null && name != JwtBearerDefaults.AuthenticationScheme)
            return;

        var supa = supabaseOptions.Value;
        var supabaseUrl = supa.Url?.Trim().TrimEnd('/') ?? string.Empty;
        var issuer = $"{supabaseUrl}/auth/v1";

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            ValidateIssuer = true,
            ValidIssuer = issuer,
            ValidateAudience = true,
            ValidAudience = "authenticated",
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(2),
            IssuerSigningKeyResolver = (_, securityToken, kid, _) =>
                ResolveSigningKeys(securityToken, kid, supa.JwtSecret),
        };

        options.MapInboundClaims = true;
    }

    public void Configure(JwtBearerOptions options) => Configure(JwtBearerDefaults.AuthenticationScheme, options);

    private IEnumerable<SecurityKey> ResolveSigningKeys(
        SecurityToken securityToken,
        string? kid,
        string? legacyJwtSecret)
    {
        if (securityToken is not JwtSecurityToken jwt)
            return [];

        var alg = jwt.Header.Alg;

        if (string.Equals(alg, "HS256", StringComparison.Ordinal))
        {
            if (string.IsNullOrWhiteSpace(legacyJwtSecret))
                return [];
            return [new SymmetricSecurityKey(Encoding.UTF8.GetBytes(legacyJwtSecret))];
        }

        var jwksKeys = keyProvider.GetJwksSigningKeys();
        if (jwksKeys.Count == 0)
            return [];

        var headerKid = jwt.Header.Kid ?? kid;
        if (!string.IsNullOrEmpty(headerKid))
        {
            return jwksKeys
                .Where(k => string.Equals(k.KeyId, headerKid, StringComparison.OrdinalIgnoreCase))
                .ToArray();
        }

        return jwksKeys;
    }
}
