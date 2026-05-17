using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MishkatulIlm_Server.Dtos;
using MishkatulIlm_Server.Options;

namespace MishkatulIlm_Server.Services;

public sealed class SupabaseAdminAuthClient(
    IHttpClientFactory httpClientFactory,
    IOptions<SupabaseAuthOptions> supabaseOptions,
    ILogger<SupabaseAdminAuthClient> logger)
{
    private readonly SupabaseAuthOptions _opts = supabaseOptions.Value;

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_opts.Url) && !string.IsNullOrWhiteSpace(_opts.ServiceRoleKey);

    /// <summary>Creates a confirmed Supabase user. Returns the new auth user id, or null on failure.</summary>
    public async Task<Guid?> CreateUserAsync(
        string email,
        string password,
        string firstName,
        string lastName,
        CancellationToken cancellationToken,
        bool onboardingCompletedInMetadata = false)
    {
        if (!IsConfigured)
        {
            logger.LogWarning("Supabase admin user create skipped: ServiceRoleKey or Url not configured.");
            return null;
        }

        var baseUrl = _opts.Url.Trim().TrimEnd('/');
        var client = httpClientFactory.CreateClient();
        using var req = new HttpRequestMessage(
            HttpMethod.Post,
            $"{baseUrl}/auth/v1/admin/users");

        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _opts.ServiceRoleKey);
        req.Headers.TryAddWithoutValidation("apikey", _opts.ServiceRoleKey);

        var payload = new
        {
            email = email.Trim(),
            password,
            email_confirm = true,
            user_metadata = new Dictionary<string, object?>
            {
                ["first_name"] = firstName.Trim(),
                ["last_name"] = lastName.Trim(),
                ["onboarding_completed"] = onboardingCompletedInMetadata,
            },
        };

        req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        HttpResponseMessage res;
        try
        {
            res = await client.SendAsync(req, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Supabase admin create user HTTP failure for {Email}", email);
            return null;
        }

        var body = await res.Content.ReadAsStringAsync(cancellationToken);
        if (!res.IsSuccessStatusCode)
        {
            logger.LogWarning(
                "Supabase admin create user failed ({Status}) for {Email}: {Body}",
                (int)res.StatusCode,
                email,
                body);
            return null;
        }

        try
        {
            var created = JsonSerializer.Deserialize<SupabaseCreateUserResponse>(body);
            if (created is null || created.Id == Guid.Empty)
            {
                logger.LogWarning("Supabase admin create user: could not parse id from body: {Body}", body);
                return null;
            }

            return created.Id;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Supabase admin create user: invalid JSON: {Body}", body);
            return null;
        }
    }

    /// <summary>Permanently removes a Supabase auth user. Returns false if not configured or the API call fails.</summary>
    public async Task<bool> DeleteUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            logger.LogWarning("Supabase admin user delete skipped: ServiceRoleKey or Url not configured.");
            return false;
        }

        var baseUrl = _opts.Url.Trim().TrimEnd('/');
        var client = httpClientFactory.CreateClient();
        using var req = new HttpRequestMessage(
            HttpMethod.Delete,
            $"{baseUrl}/auth/v1/admin/users/{userId:D}");

        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _opts.ServiceRoleKey);
        req.Headers.TryAddWithoutValidation("apikey", _opts.ServiceRoleKey);

        try
        {
            var res = await client.SendAsync(req, cancellationToken);
            if (res.IsSuccessStatusCode)
                return true;

            var body = await res.Content.ReadAsStringAsync(cancellationToken);
            logger.LogWarning(
                "Supabase admin delete user failed ({Status}) for {UserId}: {Body}",
                (int)res.StatusCode,
                userId,
                body);
            return false;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Supabase admin delete user HTTP failure for {UserId}", userId);
            return false;
        }
    }
}
