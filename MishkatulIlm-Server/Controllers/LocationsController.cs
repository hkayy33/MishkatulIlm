using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MishkatulIlm_Server.Services;

namespace MishkatulIlm_Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class LocationsController(LocationCatalogService locations) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("countries")]
    public async Task<IActionResult> GetCountries(CancellationToken cancellationToken) =>
        Ok(await locations.GetCountriesAsync(cancellationToken));

    [AllowAnonymous]
    [HttpGet("cities")]
    public async Task<IActionResult> GetCities(
        [FromQuery] int countryId,
        CancellationToken cancellationToken)
    {
        if (countryId <= 0)
            return BadRequest(new { message = "countryId is required (numeric id from /api/locations/countries)." });

        var cities = await locations.GetCitiesByCountryIdAsync(countryId, cancellationToken);
        return Ok(cities);
    }
}
