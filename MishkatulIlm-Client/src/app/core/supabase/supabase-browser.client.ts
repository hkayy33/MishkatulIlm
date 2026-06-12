import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { hasAuthCallbackParams, restorePkceVerifierBackup } from './auth-redirect';
/** One browser Supabase client so session storage and refresh are never split across instances. */
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!environment.supabaseUrl || !environment.supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Set environment.supabaseUrl and environment.supabaseAnonKey.',
    );
  }

  if (!browserClient) {
    const href = typeof globalThis !== 'undefined' ? (globalThis.location?.href ?? '') : '';
    if (href && hasAuthCallbackParams(href)) {
      restorePkceVerifierBackup();
    }

    browserClient = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Exchanged in AuthService.handleAuthRedirectResult; must be true so getSession() can parse ?code=.
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
  }

  return browserClient;
}

export function isSupabaseConfigured(): boolean {
  return !!environment.supabaseUrl && !!environment.supabaseAnonKey;
}
