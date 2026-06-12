import { environment } from '../../../environments/environment';

export const AUTH_EMAIL_CALLBACK_PATH = '/auth/callback';

const LOCAL_DEV_ORIGIN = 'http://localhost:4200';

function browserOrigin(): string {
  return typeof globalThis !== 'undefined' ? globalThis.location?.origin?.trim() ?? '' : '';
}

/** Full callback URL passed to Supabase as emailRedirectTo / auth.redirectTo. */
export function getAuthEmailRedirectUrl(): string {
  const envOrigin = environment.authRedirectOrigin?.trim();
  const origin = environment.production
    ? envOrigin || browserOrigin()
    : browserOrigin() || envOrigin || LOCAL_DEV_ORIGIN;
  return `${origin.replace(/\/$/, '')}${AUTH_EMAIL_CALLBACK_PATH}`;
}

/** True when the current URL carries Supabase auth callback params (PKCE code, tokens, or errors). */
export function hasAuthCallbackParams(href: string): boolean {
  if (!href) return false;
  try {
    const url = new URL(href);
    if (url.searchParams.has('code')) return true;
    if (url.searchParams.has('error') || url.searchParams.has('error_description')) return true;
    const hash = url.hash.replace(/^#/, '');
    if (!hash) return false;
    const hashParams = new URLSearchParams(hash);
    return hashParams.has('access_token') || hashParams.has('error');
  } catch {
    return href.includes('code=');
  }
}
