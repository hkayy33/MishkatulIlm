using Microsoft.Extensions.Options;
using MishkatulIlm_Server.Options;
using Stripe;

namespace MishkatulIlm_Server.Services;

public sealed class StripeCheckoutPriceResolver(IOptions<StripeOptions> stripeOptions)
{
    public async Task<(string? PriceId, string? Error)> ResolvePriceIdAsync(CancellationToken cancellationToken)
    {
        var options = stripeOptions.Value;
        StripeConfiguration.ApiKey = options.SecretKey;

        if (!string.IsNullOrWhiteSpace(options.ProductId))
        {
            var product = await new ProductService().GetAsync(options.ProductId, cancellationToken: cancellationToken);
            if (!string.IsNullOrWhiteSpace(product.DefaultPriceId))
                return (product.DefaultPriceId, null);

            var prices = await new PriceService().ListAsync(
                new PriceListOptions { Product = options.ProductId, Active = true, Limit = 20 },
                cancellationToken: cancellationToken);

            var recurring = prices.Data.FirstOrDefault(p => p.Recurring is not null);
            var priceId = recurring?.Id ?? prices.Data.FirstOrDefault()?.Id;
            if (priceId is not null)
                return (priceId, null);

            return (null, $"No active price found for product \"{options.ProductId}\".");
        }

        var byLookup = await new PriceService().ListAsync(
            new PriceListOptions { LookupKeys = [options.PriceLookupKey], Active = true },
            cancellationToken: cancellationToken);

        if (byLookup.Data.Count > 0)
            return (byLookup.Data[0].Id, null);

        return (null, $"No active Stripe price found for lookup key \"{options.PriceLookupKey}\".");
    }
}
