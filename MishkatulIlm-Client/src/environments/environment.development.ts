import { localDevSecrets } from './environment.development.local';

export const environment = {
  production: false,
  /** MishkatulIlm-Server `http` profile (see launchSettings.json). Use `https://localhost:7217` if you run the `https` profile. */
  apiBaseUrl: 'http://localhost:5198',
  supabaseUrl: 'https://kpvfrbgpbmlxkqqibpjp.supabase.co',
  supabaseAnonKey: localDevSecrets.supabaseAnonKey,
};
