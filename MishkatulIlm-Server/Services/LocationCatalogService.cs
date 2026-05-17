using System.Collections.Concurrent;
using CountryStateCityLibrary.Services;
using MishkatulIlm_Server.Dtos;

namespace MishkatulIlm_Server.Services;

/// <summary>Countries and cities from the CountryStateCityLibrary NuGet package.</summary>
public sealed class LocationCatalogService
{
    private readonly CountryService _countries = new();
    private readonly CityService _cities = new();

    private IReadOnlyList<LocationOptionDto>? _countriesCache;
    private readonly ConcurrentDictionary<int, IReadOnlyList<LocationOptionDto>> _citiesByCountryId = new();

    public async Task<IReadOnlyList<LocationOptionDto>> GetCountriesAsync(CancellationToken cancellationToken = default)
    {
        if (_countriesCache is not null)
            return _countriesCache;

        var countries = await _countries.GetCountries();
        _countriesCache = countries
            .OrderBy(c => c.CountryName, StringComparer.OrdinalIgnoreCase)
            .Select(c => new LocationOptionDto
            {
                Code = c.CountryId.ToString(),
                Name = c.CountryName ?? string.Empty,
            })
            .Where(c => c.Name.Length > 0)
            .ToList();

        return _countriesCache;
    }

    public async Task<IReadOnlyList<LocationOptionDto>> GetCitiesByCountryIdAsync(
        int countryId,
        CancellationToken cancellationToken = default)
    {
        if (countryId <= 0)
            return [];

        if (_citiesByCountryId.TryGetValue(countryId, out var cached))
            return cached;

        var cities = await _cities.GetCitiesByCountryId(countryId);
        var list = cities
            .OrderBy(c => c.CityName, StringComparer.OrdinalIgnoreCase)
            .Select(c => new LocationOptionDto
            {
                Code = c.CityName ?? string.Empty,
                Name = c.CityName ?? string.Empty,
            })
            .Where(c => c.Name.Length > 0)
            .DistinctBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        _citiesByCountryId[countryId] = list;
        return list;
    }
}
