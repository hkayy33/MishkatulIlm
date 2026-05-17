using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;

namespace MishkatulIlm_Server.Services;

public sealed class SchedulingSettingsService(AppDbContext db)
{
    private const int SingletonId = 1;

    public async Task<SchedulingSettingsDto> GetAsync(CancellationToken cancellationToken = default)
    {
        var row = await EnsureRowAsync(cancellationToken);
        return ToDto(row);
    }

    public async Task<SchedulingSettingsDto> UpdateAsync(
        UpdateSchedulingSettingsRequest request,
        CancellationToken cancellationToken = default)
    {
        var name = request.TutorDisplayName.Trim();
        if (name.Length == 0)
            throw new ArgumentException("Tutor display name is required.");

        var country = request.TutorCountry.Trim();
        var city = request.TutorCity.Trim();
        var tz = request.TutorTimeZoneId.Trim();
        if (string.IsNullOrEmpty(tz))
            throw new ArgumentException("Time zone is required.");

        TimeZoneInfo.FindSystemTimeZoneById(tz);

        var row = await EnsureRowAsync(cancellationToken);
        row.TutorDisplayName = name;
        row.TutorCountry = country;
        row.TutorCity = city;
        row.TutorTimeZoneId = tz;
        row.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(row);
    }

    private async Task<SchedulingSettings> EnsureRowAsync(CancellationToken cancellationToken)
    {
        var row = await db.SchedulingSettings.FirstOrDefaultAsync(s => s.Id == SingletonId, cancellationToken);
        if (row is not null)
            return row;

        row = new SchedulingSettings
        {
            Id = SingletonId,
            TutorDisplayName = "Tutor",
            TutorCountry = string.Empty,
            TutorCity = string.Empty,
            TutorTimeZoneId = "UTC",
            UpdatedAtUtc = DateTime.UtcNow,
        };
        db.SchedulingSettings.Add(row);
        await db.SaveChangesAsync(cancellationToken);
        return row;
    }

    private static SchedulingSettingsDto ToDto(SchedulingSettings row) =>
        new()
        {
            TutorDisplayName = row.TutorDisplayName,
            TutorCountry = row.TutorCountry,
            TutorCity = row.TutorCity,
            TutorTimeZoneId = row.TutorTimeZoneId,
        };
}
