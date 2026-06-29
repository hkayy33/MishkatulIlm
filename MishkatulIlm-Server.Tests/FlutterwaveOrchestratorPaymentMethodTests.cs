using MishkatulIlm_Server.Options;
using MishkatulIlm_Server.Services.Flutterwave;
using Xunit;

namespace MishkatulIlm_Server.Tests;

public sealed class FlutterwaveOrchestratorPaymentMethodTests
{
    [Fact]
    public void Resolve_defaults_to_hosted_redirect_methods()
    {
        var methods = FlutterwaveOrchestratorPaymentMethods.Resolve(new FlutterwaveOptions(), "USD");

        Assert.Equal(["applepay", "googlepay"], methods);
    }

    [Fact]
    public void Resolve_honours_explicit_override()
    {
        var methods = FlutterwaveOrchestratorPaymentMethods.Resolve(
            new FlutterwaveOptions { OrchestratorPaymentMethod = "applepay" },
            "USD");

        Assert.Equal(["applepay"], methods);
    }

    [Fact]
    public void Resolve_honours_comma_separated_override()
    {
        var methods = FlutterwaveOrchestratorPaymentMethods.Resolve(
            new FlutterwaveOptions { OrchestratorPaymentMethod = "applepay, googlepay" },
            "USD");

        Assert.Equal(["applepay", "googlepay"], methods);
    }
}
