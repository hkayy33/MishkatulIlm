import { environment } from '../../../environments/environment';

export const AUTH_EMAIL_CALLBACK_PATH = '/auth/callback';

/** Full callback URL passed to Supabase as emailRedirectTo / auth.redirectTo. */
export function getAuthEmailRedirectUrl(): string {
  const origin =
    environment.authRedirectOrigin?.trim() ||
    (typeof globalThis !== 'undefined' ? globalThis.location?.origin?.trim() : '') ||
    '';
  if (!origin) return '';
  return `${origin.replace(/\/$/, '')}${AUTH_EMAIL_CALLBACK_PATH}`;
}
