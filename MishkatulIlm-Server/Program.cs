using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MishkatulIlm_Server.Authentication;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Options;
using MishkatulIlm_Server.Services;
using MishkatulIlm_Server.Services.Flutterwave;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<AdminOptions>(builder.Configuration.GetSection(AdminOptions.SectionName));
builder.Services.Configure<StripeOptions>(builder.Configuration.GetSection(StripeOptions.SectionName));
builder.Services.Configure<FlutterwaveOptions>(builder.Configuration.GetSection(FlutterwaveOptions.SectionName));
builder.Services.Configure<CorsOptions>(builder.Configuration.GetSection(CorsOptions.SectionName));

builder.Services.AddControllers();
builder.Services.AddOpenApi();

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (!string.IsNullOrWhiteSpace(connectionString))
{
    var npgsqlBuilder = new NpgsqlDataSourceBuilder(connectionString);
    npgsqlBuilder.EnableDynamicJson();
    var npgsqlDataSource = npgsqlBuilder.Build();

    builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(npgsqlDataSource));
}

builder.Services.Configure<SupabaseAuthOptions>(builder.Configuration.GetSection(SupabaseAuthOptions.SectionName));
builder.Services.AddSingleton<IConfigureOptions<SupabaseAuthOptions>, ConfigureSupabaseAuthOptions>();

var supabaseSection = builder.Configuration.GetSection(SupabaseAuthOptions.SectionName);
var supabaseUrl = SupabaseUrlNormalizer.NormalizeProjectUrl(supabaseSection.GetValue<string>("Url"));
if (string.IsNullOrWhiteSpace(supabaseUrl))
{
    throw new InvalidOperationException(
        "Supabase:Url must be set to your project URL (e.g. https://xxxx.supabase.co).");
}

builder.Services.AddHttpClient(nameof(SupabaseJwtKeyProvider), client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
});
builder.Services.AddSingleton<SupabaseJwtKeyProvider>();
builder.Services.AddHostedService<SupabaseJwksRefreshWorker>();
builder.Services.AddHostedService<LessonRolloverWorker>();
builder.Services.AddSingleton<IPostConfigureOptions<JwtBearerOptions>, ConfigureSupabaseJwtBearerOptions>();

builder.Services.AddHttpClient();
builder.Services.AddSingleton<SupabaseAdminAuthClient>();
builder.Services.AddHttpClient(nameof(FlutterwaveApiClient), client =>
{
    client.Timeout = TimeSpan.FromSeconds(60);
});
builder.Services.AddSingleton<FlutterwaveApiClient>();
builder.Services.AddScoped<FlutterwavePaymentService>();
builder.Services.AddScoped<SchedulingSettingsService>();
builder.Services.AddScoped<ScheduleProposalService>();
builder.Services.AddScoped<LessonBillingContextService>();
builder.Services.AddScoped<LessonRolloverService>();
builder.Services.AddScoped<DevRolloverDemoService>();
builder.Services.AddScoped<DevStudentHistoryDemoService>();
builder.Services.AddScoped<StudentPaymentService>();
builder.Services.AddScoped<AdminPaymentSubmissionService>();
builder.Services.AddScoped<StudentAccountDeletionService>();
builder.Services.AddSingleton<LocationCatalogService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer();

builder.Services.AddAuthorization();

var corsOrigins = BuildCorsOrigins(builder.Configuration);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(origin => IsAllowedCorsOrigin(origin, corsOrigins))
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

var app = builder.Build();

await using (var scope = app.Services.CreateAsyncScope())
{
    var jwksProvider = scope.ServiceProvider.GetRequiredService<SupabaseJwtKeyProvider>();
    await jwksProvider.RefreshAsync(CancellationToken.None);

    var opts = scope.ServiceProvider.GetRequiredService<IOptions<SupabaseAuthOptions>>().Value;
    if (!jwksProvider.HasJwksKeys && string.IsNullOrWhiteSpace(opts.JwtSecret))
    {
        throw new InvalidOperationException(
            "Could not load any keys from Supabase JWKS and Supabase:JwtSecret is empty. " +
            "Use asymmetric JWT signing keys in Supabase (recommended), or set Supabase:JwtSecret from Dashboard → Legacy JWT Secret for HS256 tokens.");
    }
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// HTTP-only local profile (e.g. http://localhost:5198): avoid redirecting API clients to HTTPS.
app.UseForwardedHeaders();

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors();

app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var feature = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
        var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("GlobalExceptionHandler");
        logger.LogError(feature?.Error, "Unhandled exception for {Method} {Path}", context.Request.Method, context.Request.Path);

        if (!context.Response.HasStarted)
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/problem+json";
            await context.Response.WriteAsJsonAsync(new
            {
                title = "Server error",
                status = 500,
                detail = app.Environment.IsDevelopment() ? feature?.Error?.Message : "An unexpected error occurred.",
            });
        }
    });
});

app.UseAuthentication();
app.UseAuthorization();

var wwwrootPath = Path.Combine(app.Environment.ContentRootPath, "wwwroot");
var serveSpa = File.Exists(Path.Combine(wwwrootPath, "index.html"));
if (serveSpa)
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

app.MapControllers();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/health/db", async (AppDbContext? db, CancellationToken cancellationToken) =>
{
    if (db is null)
        return Results.Problem("ConnectionStrings:DefaultConnection is not configured.");

    try
    {
        var ok = await db.Database.CanConnectAsync(cancellationToken);
        if (!ok)
            return Results.Problem("Database connection failed.");
        return Results.Ok(new { status = "connected" });
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Database connection failed");
    }
});

if (serveSpa)
{
    app.MapFallbackToFile("index.html");
}

if (!string.IsNullOrWhiteSpace(connectionString))
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetService<AppDbContext>();
    var startupLogger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
    if (db is not null)
    {
        try
        {
            var pending = (await db.Database.GetPendingMigrationsAsync()).ToList();
            if (pending.Count > 0)
                startupLogger.LogInformation("Applying {Count} pending migration(s): {Migrations}", pending.Count, string.Join(", ", pending));

            await db.Database.MigrateAsync();
            startupLogger.LogInformation("Database migrations are up to date.");
        }
        catch (Exception ex)
        {
            startupLogger.LogCritical(ex, "Database migration failed on startup.");
            throw;
        }
    }
}

app.Run();

static string[] BuildCorsOrigins(IConfiguration configuration)
{
    var origins = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    foreach (var origin in configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
    {
        if (string.IsNullOrWhiteSpace(origin) || origin.Contains('*', StringComparison.Ordinal))
            continue;

        origins.Add(NormalizeOrigin(origin));
    }

    var clientAppUrl = configuration["Flutterwave:ClientAppUrl"]
        ?? configuration["Stripe:ClientAppUrl"];
    if (!string.IsNullOrWhiteSpace(clientAppUrl))
        origins.Add(NormalizeOrigin(clientAppUrl));

    if (origins.Count == 0)
    {
        origins.Add("http://localhost:4200");
        origins.Add("https://localhost:4200");
    }

    return [.. origins];
}

static bool IsAllowedCorsOrigin(string origin, string[] allowedOrigins)
{
    if (string.IsNullOrWhiteSpace(origin))
        return false;

    var normalized = NormalizeOrigin(origin);
    if (allowedOrigins.Contains(normalized, StringComparer.OrdinalIgnoreCase))
        return true;

    if (!Uri.TryCreate(normalized, UriKind.Absolute, out var uri))
        return false;

    return uri.Host.EndsWith(".vercel.app", StringComparison.OrdinalIgnoreCase);
}

static string NormalizeOrigin(string value) => value.Trim().TrimEnd('/');
