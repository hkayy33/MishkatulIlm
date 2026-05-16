import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import type { LocationOption } from '../models/location.models';

@Injectable({ providedIn: 'root' })
export class LocationsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getCountries(): Observable<LocationOption[]> {
    return this.http.get<LocationOption[]>(`${this.apiBaseUrl}/api/locations/countries`);
  }

  getCities(countryId: number): Observable<LocationOption[]> {
    return this.http.get<LocationOption[]>(`${this.apiBaseUrl}/api/locations/cities`, {
      params: { countryId: String(countryId) },
    });
  }
}
