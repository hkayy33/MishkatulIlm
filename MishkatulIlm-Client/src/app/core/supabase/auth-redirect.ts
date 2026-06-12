import { environment } from '../../../environments/environment';

export const AUTH_EMAIL_CALLBACK_PATH = '/auth/callback';

/** Set after register when email confirmation is required; used if PKCE link opens in another browser. */
export const PENDING_SIGNUP_EMAIL_KEY = 'mishkatul_pending_signup_email';

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

/**
 * PKCE signup tokens (`pkce_…` in `{{ .TokenHash }}`) cannot be verified with verifyOtp on the app.
 * They must hit Supabase `/auth/v1/verify` first, which confirms email and redirects back with `?code=`.
 */
export function buildSupabasePkceVerifyUrl(token: string, redirectTo?: string): string | null {
  const trimmed = token.trim();
  if (!trimmed.startsWith('pkce_')) return null;

  const base = environment.supabaseUrl?.trim().replace(/\/$/, '');
  if (!base) return null;

  const url = new URL(`${base}/auth/v1/verify`);
  url.searchParams.set('token', trimmed);
  url.searchParams.set('type', 'email');
  url.searchParams.set('redirect_to', redirectTo?.trim() || getAuthEmailRedirectUrl());
  return url.toString();
}

/** True when TokenHash from the email template is a PKCE verifier token (not a direct OTP hash). */
export function isPkceEmailToken(token: string): boolean {
  return token.trim().startsWith('pkce_');
}

/** True when the current URL carries Supabase auth callback params (PKCE code, email OTP, tokens, or errors). */
export function hasAuthCallbackParams(href: string): boolean {
  if (!href) return false;
  try {
    const url = new URL(href);
    if (url.searchParams.has('code')) return true;
    if (url.searchParams.has('token_hash')) return true;
    if (url.searchParams.has('error') || url.searchParams.has('error_description')) return true;
    const hash = url.hash.replace(/^#/, '');
    if (!hash) return false;
    const hashParams = new URLSearchParams(hash);
    return hashParams.has('access_token') || hashParams.has('error') || hashParams.has('code');
  } catch {
    return href.includes('code=') || href.includes('token_hash=');
  }
}
