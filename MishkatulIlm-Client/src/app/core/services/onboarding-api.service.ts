import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import type { SaveOnboardingRequest } from '../models/onboarding.models';

@Injectable({ providedIn: 'root' })
export class OnboardingApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  /** Persists onboarding to the database (requires Bearer token). */
  save(body: SaveOnboardingRequest): Observable<void> {
    return this.http.post<void>(`${this.apiBaseUrl}/api/onboarding`, body);
  }
}
