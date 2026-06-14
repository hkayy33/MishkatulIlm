using MishkatulIlm_Server.Data;

namespace MishkatulIlm_Server.Services;

public static class PaymentReferenceHelper
{
    public static string Build(AppUser user)
    {
        var last = NormalizePart(user.LastName);
        var first = NormalizePart(user.FirstName);
        return $"{last}{first}";
    }

    private static string NormalizePart(string value) =>
        new string(value.Where(c => !char.IsWhiteSpace(c)).ToArray());
}
