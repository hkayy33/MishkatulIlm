using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Data;
using Stripe.Checkout;

namespace MishkatulIlm_Server.Services;

public sealed class StripePaymentRecorder(AppDbContext db, ILogger<StripePaymentRecorder> logger)
{
    public async Task<bool> TryRecordCheckoutSessionAsync(Session session, CancellationToken cancellationToken)
    {
        if (!string.Equals(session.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(session.Status, "complete", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var userIdRaw = session.Metadata.TryGetValue("user_id", out var fromMeta)
            ? fromMeta
            : session.ClientReferenceId;

        if (string.IsNullOrWhiteSpace(userIdRaw) || !Guid.TryParse(userIdRaw, out var userId))
        {
            logger.LogWarning("Checkout session {SessionId} has invalid user id.", session.Id);
            return false;
        }

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId && !u.IsAdmin, cancellationToken);
        if (user is null)
        {
            logger.LogWarning("Checkout session {SessionId} references unknown user {UserId}.", session.Id, userId);
            return false;
        }

        if (user.LastPaymentAtUtc is not null)
            return true;

        var paidAt = DateTime.UtcNow;
        user.LastPaymentAtUtc = paidAt;
        user.LastPaymentAmount = session.AmountTotal.HasValue
            ? session.AmountTotal.Value / 100m
            : user.LastPaymentAmount;
        user.LastPaymentCurrency = string.IsNullOrWhiteSpace(session.Currency)
            ? user.LastPaymentCurrency
            : session.Currency.ToUpperInvariant();

        if (user.NextPaymentDueUtc is null || user.NextPaymentDueUtc <= paidAt)
            user.NextPaymentDueUtc = paidAt.Date.AddMonths(1);

        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Recorded payment for user {UserId} from session {SessionId}.", userId, session.Id);
        return true;
    }
}
