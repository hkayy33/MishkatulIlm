import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Syncs the profile row, loads `isAdmin` from the API, then allows `/admin` (covers cold refresh).
 */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.whenSessionReady$().pipe(
    switchMap((ready) => {
      if (!ready) return of(router.parseUrl('/login'));
      return auth.syncServerProfile().pipe(
        switchMap(() => auth.refreshServerProfile()),
        map(() => (auth.user()?.isAdmin ? true : router.parseUrl('/'))),
        catchError(() => of(router.parseUrl('/'))),
      );
    }),
  );
};
