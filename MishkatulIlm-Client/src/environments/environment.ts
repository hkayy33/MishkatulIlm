/**
 * Default environment file (used when no `fileReplacements` apply, e.g. some tests).
 * `ng serve` / development builds use `environment.development.ts` (see `angular.json`).
 * Production builds use `environment.prod.ts`. Anon keys live in gitignored `*.local.ts` files created by `npm postinstall`.
 */
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:5198',
  supabaseUrl: 'https://kpvfrbgpbmlxkqqibpjp.supabase.co',
  supabaseAnonKey: '',
  /** Override for Supabase emailRedirectTo (e.g. LAN IP for phone testing). Falls back to window.location.origin. */
  authRedirectOrigin: undefined as string | undefined,
};
