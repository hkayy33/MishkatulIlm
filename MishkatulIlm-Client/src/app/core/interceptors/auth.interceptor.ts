import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Attaches the Supabase access token from {@link AuthService.getBearerToken$} on every API request
 * so the Bearer header always matches persisted session storage (not a stale in-memory copy).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  if (!auth.isApiRequest(req.url)) return next(req);

  return auth.getBearerToken$().pipe(
    switchMap((token) => {
      if (!token) {
        console.warn('[authInterceptor] No Supabase session for API request:', req.url);
        return next(req);
      }
      return next(
        req.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
        }),
      );
    }),
  );
};
