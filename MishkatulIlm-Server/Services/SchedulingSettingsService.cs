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
        row.PaymentHourlyRateUsd = request.PaymentHourlyRateUsd > 0
            ? request.PaymentHourlyRateUsd
            : LessonBillingService.DefaultHourlyRateUsd;
        row.PaymentAccountName = request.PaymentAccountName.Trim();
        row.PaymentAccountNumber = request.PaymentAccountNumber.Trim();
        row.PaymentSortCode = request.PaymentSortCode.Trim();
        row.PaymentBankName = request.PaymentBankName.Trim();
        row.PaymentInstructions = request.PaymentInstructions.Trim();
        row.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(row);
    }

    private async Task<SchedulingSettings> EnsureRowAsync(CancellationToken cancellationToken)
    {
        var row = await db.SchedulingSettings.FirstOrDefaultAsync(s => s.Id == SingletonId, cancellationToken);
        if (row is not null)
        {
            if (string.IsNullOrWhiteSpace(row.PaymentAccountName)
                && string.IsNullOrWhiteSpace(row.PaymentAccountNumber)
                && string.IsNullOrWhiteSpace(row.PaymentSortCode))
            {
                row.PaymentAccountName = PaymentAccountDefaults.AccountName;
                row.PaymentAccountNumber = PaymentAccountDefaults.AccountNumber;
                row.PaymentSortCode = PaymentAccountDefaults.SortCode;
                row.UpdatedAtUtc = DateTime.UtcNow;
                await db.SaveChangesAsync(cancellationToken);
            }

            return row;
        }

        row = new SchedulingSettings
        {
            Id = SingletonId,
            TutorDisplayName = "Tutor",
            TutorCountry = string.Empty,
            TutorCity = string.Empty,
            TutorTimeZoneId = "UTC",
            PaymentHourlyRateUsd = LessonBillingService.DefaultHourlyRateUsd,
            PaymentAccountName = PaymentAccountDefaults.AccountName,
            PaymentAccountNumber = PaymentAccountDefaults.AccountNumber,
            PaymentSortCode = PaymentAccountDefaults.SortCode,
            UpdatedAtUtc = DateTime.UtcNow,
        };
        db.SchedulingSettings.Add(row);
        await db.SaveChangesAsync(cancellationToken);
        return row;
    }

    public async Task<SchedulingSettings> GetEntityAsync(CancellationToken cancellationToken = default) =>
        await EnsureRowAsync(cancellationToken);

    private static SchedulingSettingsDto ToDto(SchedulingSettings row) =>
        new()
        {
            TutorDisplayName = row.TutorDisplayName,
            TutorCountry = row.TutorCountry,
            TutorCity = row.TutorCity,
            TutorTimeZoneId = row.TutorTimeZoneId,
            PaymentHourlyRateUsd = row.PaymentHourlyRateUsd,
            PaymentAccountName = row.PaymentAccountName,
            PaymentAccountNumber = row.PaymentAccountNumber,
            PaymentSortCode = row.PaymentSortCode,
            PaymentBankName = row.PaymentBankName,
            PaymentInstructions = row.PaymentInstructions,
        };
}
