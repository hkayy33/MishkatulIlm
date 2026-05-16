using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace MishkatulIlm_Server.Authentication;

public static class SupabaseClaimsExtensions
{
    public static bool TryGetSupabaseUserId(this ClaimsPrincipal user, out Guid userId)
    {
        var candidates = new[]
        {
            user.FindFirstValue(ClaimTypes.NameIdentifier),
            user.FindFirstValue(JwtRegisteredClaimNames.Sub),
            user.FindFirstValue("sub"),
            user.FindFirstValue("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"),
        };

        foreach (var raw in candidates)
        {
            if (string.IsNullOrWhiteSpace(raw))
                continue;
            if (Guid.TryParse(raw.Trim(), out userId))
                return true;
        }

        userId = default;
        return false;
    }
}
