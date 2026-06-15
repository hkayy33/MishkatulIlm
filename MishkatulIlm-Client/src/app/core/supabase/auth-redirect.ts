import { environment } from '../../../environments/environment';

export const AUTH_EMAIL_CALLBACK_PATH = '/auth/callback';

/** Set after register when email confirmation is required; used if PKCE link opens in another browser. */
export const PENDING_SIGNUP_EMAIL_KEY = 'mishkatul_pending_signup_email';

/** Backup of Supabase PKCE code_verifier from signup — localStorage so email links work in a new tab. */
export const PENDING_PKCE_VERIFIER_KEY = 'mishkatul_pkce_verifier';

/** Saved `?code=` before Supabase SDK or the router strips query params from the callback URL. */
export const AUTH_CALLBACK_CODE_KEY = 'mishkatul_auth_callback_code';

/** Set while a password-recovery email link is being processed (PKCE may drop `type=recovery`). */
export const PASSWORD_RECOVERY_PENDING_KEY = 'mishkatul_password_recovery_pending';

/** localStorage key Supabase uses for the PKCE code_verifier (`sb-<project-ref>-auth-token-code-verifier`). */
export function supabaseCodeVerifierStorageKey(): string | null {
  const base = environment.supabaseUrl?.trim().replace(/\/$/, '') ?? '';
  const match = /\/\/([^.]+)\.supabase\.co/.exec(base);
  return match?.[1] ? `sb-${match[1]}-auth-token-code-verifier` : null;
}

function readStorage(kind: 'local' | 'session', key: string): string | null {
  if (typeof globalThis === 'undefined') return null;
  try {
    const store = kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(kind: 'local' | 'session', key: string, value: string): void {
  if (typeof globalThis === 'undefined') return;
  try {
    const store = kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    store?.setItem(key, value);
  } catch {
    // ignore private mode
  }
}

function removeStorage(kind: 'local' | 'session', key: string): void {
  if (typeof globalThis === 'undefined') return;
  try {
    const store = kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    store?.removeItem(key);
  } catch {
    // ignore
  }
}

export function backupPkceVerifierFromSignup(): void {
  const key = supabaseCodeVerifierStorageKey();
  if (!key) return;

  const persist = (): void => {
    const verifier = readStorage('local', key);
    if (verifier) {
      writeStorage('local', PENDING_PKCE_VERIFIER_KEY, verifier);
    }
  };

  persist();
  // Supabase may write the verifier slightly after signUp resolves.
  globalThis.setTimeout?.(persist, 0);
  globalThis.setTimeout?.(persist, 150);
}

/** Restore signup PKCE verifier before exchanging `?code=` from the confirmation email. */
export function restorePkceVerifierBackup(): boolean {
  const key = supabaseCodeVerifierStorageKey();
  if (!key) return false;

  const backup =
    readStorage('local', PENDING_PKCE_VERIFIER_KEY) ??
    readStorage('session', PENDING_PKCE_VERIFIER_KEY);
  if (!backup) return false;

  try {
    globalThis.localStorage?.setItem(key, backup);
    return true;
  } catch {
    return false;
  }
}

/** Persist callback query params before anything consumes or strips them from the URL. */
export function captureAuthCallbackSnapshot(href: string): void {
  if (!href) return;
  try {
    const url = new URL(href);
    const code = url.searchParams.get('code')?.trim();
    if (code) writeStorage('session', AUTH_CALLBACK_CODE_KEY, code);
  } catch {
    const match = /[?&]code=([^&]+)/.exec(href);
    if (match?.[1]) writeStorage('session', AUTH_CALLBACK_CODE_KEY, decodeURIComponent(match[1]));
  }
}

export function getAuthCallbackCode(href: string): string | null {
  try {
    const fromUrl = new URL(href).searchParams.get('code')?.trim();
    if (fromUrl) return fromUrl;
  } catch {
    const match = /[?&]code=([^&]+)/.exec(href);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return readStorage('session', AUTH_CALLBACK_CODE_KEY)?.trim() ?? null;
}

export function clearAuthCallbackSnapshot(): void {
  removeStorage('session', AUTH_CALLBACK_CODE_KEY);
}

export function markPasswordRecoveryPending(): void {
  writeStorage('session', PASSWORD_RECOVERY_PENDING_KEY, '1');
}

export function isPasswordRecoveryPending(): boolean {
  return readStorage('session', PASSWORD_RECOVERY_PENDING_KEY) === '1';
}

export function clearPasswordRecoveryPending(): void {
  removeStorage('session', PASSWORD_RECOVERY_PENDING_KEY);
}

export function getPendingSignupEmail(): string | null {
  const email =
    readStorage('local', PENDING_SIGNUP_EMAIL_KEY) ?? readStorage('session', PENDING_SIGNUP_EMAIL_KEY);
  const trimmed = email?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** Supabase error redirect (`?error=` / `#error=`) after a failed email-link verify. */
export function parseAuthCallbackError(href: string): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    const queryError =
      url.searchParams.get('error_description')?.trim() ||
      url.searchParams.get('error')?.trim() ||
      '';
    if (queryError) return queryError;

    const hash = url.hash.replace(/^#/, '');
    if (!hash) return null;
    const hashParams = new URLSearchParams(hash);
    return (
      hashParams.get('error_description')?.trim() ||
      hashParams.get('error')?.trim() ||
      null
    );
  } catch {
    return null;
  }
}

export function isAuthCallbackRoute(pathname: string): boolean {
  return pathname === AUTH_EMAIL_CALLBACK_PATH || pathname.endsWith(AUTH_EMAIL_CALLBACK_PATH);
}

/**
 * Supabase may land auth params on Site URL (`/`) when redirect URLs are misconfigured.
 * Normalize to `/auth/callback` so one code path handles email links.
 */
export function redirectToAuthCallbackIfNeeded(href: string): boolean {
  if (!href || typeof globalThis === 'undefined') return false;
  try {
    const url = new URL(href);
    if (isAuthCallbackRoute(url.pathname)) return false;
    if (!hasAuthCallbackParams(href)) return false;
    url.pathname = AUTH_EMAIL_CALLBACK_PATH;
    globalThis.location.replace(url.toString());
    return true;
  } catch {
    return false;
  }
}

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
export function buildSupabasePkceVerifyUrl(
  token: string,
  redirectTo?: string,
  type = 'signup',
): string | null {
  const trimmed = token.trim();
  if (!trimmed.startsWith('pkce_')) return null;

  const base = environment.supabaseUrl?.trim().replace(/\/$/, '');
  if (!base) return null;

  const url = new URL(`${base}/auth/v1/verify`);
  url.searchParams.set('token', trimmed);
  url.searchParams.set('type', type);
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
