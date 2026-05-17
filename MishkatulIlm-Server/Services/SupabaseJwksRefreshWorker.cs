namespace MishkatulIlm_Server.Services;

/// <summary>Refreshes JWKS periodically so standby key rotations are picked up (Supabase recommends ~20 min awareness).</summary>
public sealed class SupabaseJwksRefreshWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<SupabaseJwksRefreshWorker> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(15);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(Interval, stoppingToken).ConfigureAwait(false);
                await using var scope = scopeFactory.CreateAsyncScope();
                var provider = scope.ServiceProvider.GetRequiredService<SupabaseJwtKeyProvider>();
                await provider.RefreshAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Supabase JWKS refresh tick failed.");
            }
        }
    }
}
