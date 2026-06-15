namespace MishkatulIlm_Server.Services;

/// <summary>Periodically books the next 4-week lesson block for students whose current block has ended.</summary>
public sealed class LessonRolloverWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<LessonRolloverWorker> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken).ConfigureAwait(false);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var rollover = scope.ServiceProvider.GetRequiredService<LessonRolloverService>();
                var count = await rollover.RolloverDueStudentsAsync(stoppingToken).ConfigureAwait(false);
                if (count > 0)
                {
                    logger.LogInformation("Lesson rollover worker booked next blocks for {StudentCount} student(s).", count);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Lesson rollover worker tick failed.");
            }

            try
            {
                await Task.Delay(Interval, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }
}
