using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MishkatulIlm_Server.Authentication;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Options;
using MishkatulIlm_Server.Services;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<AdminOptions>(builder.Configuration.GetSection(AdminOptions.SectionName));

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

var supabaseSection = builder.Configuration.GetSection(SupabaseAuthOptions.SectionName);
var supabaseUrl = supabaseSection.GetValue<string>("Url")?.Trim().TrimEnd('/') ?? string.Empty;
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
builder.Services.AddSingleton<IPostConfigureOptions<JwtBearerOptions>, ConfigureSupabaseJwtBearerOptions>();

builder.Services.AddHttpClient();
builder.Services.AddSingleton<SupabaseAdminAuthClient>();
builder.Services.AddScoped<SchedulingSettingsService>();
builder.Services.AddSingleton<LocationCatalogService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer();

builder.Services.AddAuthorization();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(
                "http://localhost:4200",
                "https://localhost:4200")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
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
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

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

if (!string.IsNullOrWhiteSpace(connectionString))
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetService<AppDbContext>();
    if (db is not null)
        await db.Database.MigrateAsync();
}

app.Run();
