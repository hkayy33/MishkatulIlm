using Microsoft.Extensions.Options;

namespace MishkatulIlm_Server.Options;

/// <summary>Normalizes <see cref="SupabaseAuthOptions.Url"/> after configuration binding.</summary>
public sealed class ConfigureSupabaseAuthOptions : IConfigureOptions<SupabaseAuthOptions>
{
    public void Configure(SupabaseAuthOptions options)
    {
        options.Url = SupabaseUrlNormalizer.NormalizeProjectUrl(options.Url);
    }
}
