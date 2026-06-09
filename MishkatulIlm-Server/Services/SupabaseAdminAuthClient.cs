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

    /// <summary>Marks a pending signup as email-confirmed (dev bypass; no redirect URL required).</summary>
    public async Task<(bool Success, bool AlreadyConfirmed)> ConfirmSignupEmailAsync(
        string email,
        CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            logger.LogWarning("Supabase confirm signup skipped: ServiceRoleKey or Url not configured.");
            return (false, false);
        }

        var normalized = email.Trim();
        var user = await FindUserByEmailAsync(normalized, cancellationToken);
        if (user is null)
        {
            logger.LogWarning("Supabase confirm signup: no auth user for {Email}", normalized);
            return (false, false);
        }

        if (user.EmailConfirmedAt is not null)
            return (true, true);

        var baseUrl = _opts.Url.Trim().TrimEnd('/');
        var client = httpClientFactory.CreateClient();
        using var req = new HttpRequestMessage(
            HttpMethod.Put,
            $"{baseUrl}/auth/v1/admin/users/{user.Id}");

        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _opts.ServiceRoleKey);
        req.Headers.TryAddWithoutValidation("apikey", _opts.ServiceRoleKey);
        req.Content = new StringContent(
            JsonSerializer.Serialize(new { email_confirm = true }),
            Encoding.UTF8,
            "application/json");

        HttpResponseMessage res;
        try
        {
            res = await client.SendAsync(req, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Supabase confirm signup HTTP failure for {Email}", normalized);
            return (false, false);
        }

        var body = await res.Content.ReadAsStringAsync(cancellationToken);
        if (!res.IsSuccessStatusCode)
        {
            logger.LogWarning(
                "Supabase confirm signup failed ({Status}) for {Email}: {Body}",
                (int)res.StatusCode,
                normalized,
                body);
            return (false, false);
        }

        return (true, false);
    }

    /// <summary>
    /// Builds a signup confirmation URL with an explicit <paramref name="redirectTo"/> (bypasses email templates).
    /// </summary>
    public async Task<(string? ActionLink, string? RedirectTo)> GenerateSignupConfirmationLinkAsync(
        string email,
        string redirectTo,
        CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            logger.LogWarning("Supabase generate_link skipped: ServiceRoleKey or Url not configured.");
            return (null, null);
        }

        var baseUrl = _opts.Url.Trim().TrimEnd('/');
        var client = httpClientFactory.CreateClient();
        using var req = new HttpRequestMessage(
            HttpMethod.Post,
            $"{baseUrl}/auth/v1/admin/generate_link");

        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _opts.ServiceRoleKey);
        req.Headers.TryAddWithoutValidation("apikey", _opts.ServiceRoleKey);

        var payload = new
        {
            type = "signup",
            email = email.Trim(),
            options = new { redirect_to = redirectTo.Trim() },
        };

        req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        HttpResponseMessage res;
        try
        {
            res = await client.SendAsync(req, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Supabase generate_link HTTP failure for {Email}", email);
            return (null, null);
        }

        var body = await res.Content.ReadAsStringAsync(cancellationToken);
        if (!res.IsSuccessStatusCode)
        {
            logger.LogWarning(
                "Supabase generate_link failed ({Status}) for {Email}: {Body}",
                (int)res.StatusCode,
                email,
                body);
            return (null, null);
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<SupabaseGenerateLinkResponse>(body);
            var actionLink = parsed?.ActionLink ?? parsed?.Properties?.ActionLink;
            var resolvedRedirect = parsed?.RedirectTo ?? parsed?.Properties?.RedirectTo ?? redirectTo;
            if (string.IsNullOrWhiteSpace(actionLink))
            {
                logger.LogWarning("Supabase generate_link: missing action_link for {Email}: {Body}", email, body);
                return (null, null);
            }

            return (actionLink, resolvedRedirect);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Supabase generate_link: invalid JSON for {Email}: {Body}", email, body);
            return (null, null);
        }
    }

    private async Task<SupabaseAdminUserSummary?> FindUserByEmailAsync(
        string email,
        CancellationToken cancellationToken)
    {
        var baseUrl = _opts.Url.Trim().TrimEnd('/');
        var client = httpClientFactory.CreateClient();
        var target = email.Trim();
        const int perPage = 200;

        for (var page = 1; page <= 5; page++)
        {
            using var req = new HttpRequestMessage(
                HttpMethod.Get,
                $"{baseUrl}/auth/v1/admin/users?page={page}&per_page={perPage}");

            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _opts.ServiceRoleKey);
            req.Headers.TryAddWithoutValidation("apikey", _opts.ServiceRoleKey);

            HttpResponseMessage res;
            try
            {
                res = await client.SendAsync(req, cancellationToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Supabase list users HTTP failure while resolving {Email}", target);
                return null;
            }

            var body = await res.Content.ReadAsStringAsync(cancellationToken);
            if (!res.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "Supabase list users failed ({Status}) while resolving {Email}: {Body}",
                    (int)res.StatusCode,
                    target,
                    body);
                return null;
            }

            SupabaseListUsersResponse? parsed;
            try
            {
                parsed = JsonSerializer.Deserialize<SupabaseListUsersResponse>(body);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Supabase list users: invalid JSON while resolving {Email}: {Body}", target, body);
                return null;
            }

            var users = parsed?.Users ?? [];
            if (users.Count == 0)
                return null;

            var match = users.FirstOrDefault(
                u => string.Equals(u.Email?.Trim(), target, StringComparison.OrdinalIgnoreCase));
            if (match is not null)
                return match;

            if (users.Count < perPage)
                return null;
        }

        return null;
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
            $"{baseUrl}/auth/v1/admin/users/{userId:D}?should_soft_delete=false");

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
