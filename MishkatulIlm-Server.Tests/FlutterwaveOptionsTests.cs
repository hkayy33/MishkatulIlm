using MishkatulIlm_Server.Options;
using Xunit;

namespace MishkatulIlm_Server.Tests;

public sealed class FlutterwaveOptionsTests
{
    [Fact]
    public void CanAcceptPayments_when_v4_or_v3_secret_configured()
    {
        Assert.True(new FlutterwaveOptions
        {
            ClientId = "id",
            ClientSecret = "secret",
        }.CanAcceptPayments);

        Assert.True(new FlutterwaveOptions
        {
            SecretKey = "FLWSECK-test",
        }.CanAcceptPayments);

        Assert.False(new FlutterwaveOptions().CanAcceptPayments);
    }
}
