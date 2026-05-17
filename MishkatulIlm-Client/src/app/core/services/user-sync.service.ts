import { HttpBackend, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, of } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';

/**
 * POST /api/users/sync — backfill/patch the app `users` row (created at signup by a DB trigger on `auth.users`).
 * Uses {@link HttpBackend} so the request does not go through interceptors (avoids AuthService ↔ HttpClient cycles).
 */
@Injectable({ providedIn: 'root' })
export class UserSyncService {
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly backend = inject(HttpBackend);
  private readonly http = new HttpClient(this.backend);

  syncWithBearer(accessToken: string | null): Observable<void> {
    if (!accessToken || !this.apiBaseUrl) {
      return of(void 0);
    }
    const url = `${this.apiBaseUrl}/api/users/sync`;
    return this.http
      .post<void>(url, {}, { headers: { Authorization: `Bearer ${accessToken}` } })
      .pipe(
        catchError((err: unknown) => {
          if (err instanceof HttpErrorResponse) {
            console.warn(
              '[UserSyncService] POST /api/users/sync failed:',
              url,
              'status=',
              err.status,
              'body=',
              err.error,
            );
          } else {
            console.warn('[UserSyncService] POST /api/users/sync failed:', url, err);
          }
          return of(void 0);
        }),
      );
  }
}
