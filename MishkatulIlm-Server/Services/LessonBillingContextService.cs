using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;

namespace MishkatulIlm_Server.Services;

/// <summary>Resolves which billing period and lessons apply, including pending rollover blocks.</summary>
public sealed class LessonBillingContextService(AppDbContext db)
{
    public async Task<BillingResolution> ResolveAsync(
        AppUser user,
        DateTime utcNow,
        CancellationToken cancellationToken = default)
    {
        var planned = await LessonRolloverPlanner.TryPlanNextBlockAsync(db, user.Id, utcNow, cancellationToken);
        if (planned is { Count: > 0 })
        {
            var (year, month) = LessonBillingService.BillingMonthForLessonStart(planned[0].StartsAtUtc);
            return new BillingResolution(year, month, IsRolloverBlock: true, planned);
        }

        var (billingYear, billingMonth) = LessonBillingService.ResolveBillingMonth(user, utcNow);
        return new BillingResolution(billingYear, billingMonth, IsRolloverBlock: false, null);
    }

    public async Task<List<LessonSlot>> LoadBillableLessonsAsync(
        BillingResolution billing,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        if (billing.IsRolloverBlock && billing.PlannedRollover is { Count: > 0 })
            return LessonBillingService.SyntheticSlotsFromPlanned(billing.PlannedRollover).ToList();

        var (monthStart, monthEnd) = LessonBillingService.MonthRangeUtc(billing.BillingYear, billing.BillingMonth);
        return await db.LessonSlots.AsNoTracking()
            .Where(s => s.StudentUserId == userId && s.StartsAtUtc >= monthStart && s.StartsAtUtc < monthEnd)
            .OrderBy(s => s.StartsAtUtc)
            .ToListAsync(cancellationToken);
    }

    public async Task<bool> IsBillingPeriodPaidAsync(
        Guid studentUserId,
        BillingResolution billing,
        CancellationToken cancellationToken = default) =>
        await db.PaymentSubmissions.AsNoTracking()
            .AnyAsync(
                s =>
                    s.StudentUserId == studentUserId
                    && s.BillingYear == billing.BillingYear
                    && s.BillingMonth == billing.BillingMonth
                    && s.Status == PaymentSubmissionStatusCodes.Paid,
                cancellationToken);
}

public sealed record BillingResolution(
    int BillingYear,
    int BillingMonth,
    bool IsRolloverBlock,
    IReadOnlyList<PlannedLessonSlotDto>? PlannedRollover);
