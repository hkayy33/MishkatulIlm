using MishkatulIlm_Server.Services.Flutterwave;
using Xunit;

namespace MishkatulIlm_Server.Tests;

public sealed class FlutterwaveCustomerNameHelperTests
{
    [Fact]
    public void Resolve_pads_single_letter_last_name_for_Flutterwave_minimum()
    {
        var (first, last) = FlutterwaveCustomerNameHelper.Resolve("Hassan", "K");

        Assert.Equal("Hassan", first);
        Assert.Equal("K.", last);
    }

    [Fact]
    public void Resolve_uses_fallback_when_name_missing()
    {
        var (first, last) = FlutterwaveCustomerNameHelper.Resolve(null, null);

        Assert.Equal("Student", first);
        Assert.Equal("User", last);
    }

    [Fact]
    public void Resolve_strips_disallowed_characters()
    {
        var (first, last) = FlutterwaveCustomerNameHelper.Resolve("Hassan123", "O'Brien");

        Assert.Equal("Hassan", first);
        Assert.Equal("O'Brien", last);
    }
}
