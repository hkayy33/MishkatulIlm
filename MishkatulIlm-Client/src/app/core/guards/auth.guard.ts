import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { deferAuthToBrowser } from './guard.utils';

/** Requires a Supabase session (waits for session restore from storage on refresh). */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return deferAuthToBrowser(() =>
    auth.whenSessionReady$().pipe(
      map((ok) =>
        ok
          ? true
          : router.createUrlTree(['/login'], {
              queryParams: { returnUrl: state.url },
            }),
      ),
    ),
  );
};
