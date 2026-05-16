import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Requires a Supabase session (waits for session restore from storage on refresh). */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.whenSessionReady$().pipe(
    map((ok) => (ok ? true : router.parseUrl('/login'))),
  );
};
