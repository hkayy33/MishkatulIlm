import { HttpBackend, HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';

export interface UserMeDto {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  onboardingCompleted: boolean;
  isAdmin: boolean;
}

/**
 * Loads the current user's row from the API using {@link HttpBackend} so the request does not
 * go through interceptors (avoids AuthService ↔ HttpClient cycles).
 */
@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly backend = inject(HttpBackend);
  private readonly http = new HttpClient(this.backend);

  getMe(accessToken: string): Observable<UserMeDto> {
    const url = `${this.apiBaseUrl}/api/users/me`;
    return this.http.get<UserMeDto>(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  }
}
