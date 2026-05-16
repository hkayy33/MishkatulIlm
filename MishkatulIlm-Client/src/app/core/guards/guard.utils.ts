import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { type Observable, of } from 'rxjs';

/**
 * SSR has no access to Supabase localStorage. Guards must not redirect to login on the
 * server — the browser restores the session in {@link AuthService.initSession} after hydration.
 */
export function isBrowserAuthCheck(): boolean {
  return isPlatformBrowser(inject(PLATFORM_ID));
}

/** When false, guards should allow navigation and re-check on the client. */
export function deferAuthToBrowser<T>(browserCheck: () => Observable<T>): Observable<T | true> {
  if (!isBrowserAuthCheck()) {
    return of(true);
  }
  return browserCheck();
}
