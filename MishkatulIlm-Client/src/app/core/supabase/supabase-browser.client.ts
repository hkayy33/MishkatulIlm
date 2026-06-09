import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
/** One browser Supabase client so session storage and refresh are never split across instances. */
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!environment.supabaseUrl || !environment.supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Set environment.supabaseUrl and environment.supabaseAnonKey.',
    );
  }

  browserClient ??= createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      // Default localStorage — required for reliable session restore across reloads.
    },
  });

  return browserClient;
}

export function isSupabaseConfigured(): boolean {
  return !!environment.supabaseUrl && !!environment.supabaseAnonKey;
}
