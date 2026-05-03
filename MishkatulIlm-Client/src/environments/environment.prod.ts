import { prodSecrets } from './environment.prod.local';

export const environment = {
  production: true,
  /** Override to your deployed API URL before release builds. */
  apiBaseUrl: 'http://localhost:5198',
  supabaseUrl: 'https://kpvfrbgpbmlxkqqibpjp.supabase.co',
  supabaseAnonKey: prodSecrets.supabaseAnonKey,
};
