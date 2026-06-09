import { localDevSecrets } from './environment.development.local';

/** Match API host to auth redirect origin so phone testing hits the Mac, not localhost. */
function devApiBaseUrl(redirectOrigin: string | undefined): string {
  const trimmed = redirectOrigin?.trim();
  if (!trimmed) return 'http://localhost:5198';
  try {
    const url = new URL(trimmed);
    url.port = '5198';
    return url.origin;
  } catch {
    return 'http://localhost:5198';
  }
}

export const environment = {
  production: false,
  /** MishkatulIlm-Server `http` profile (see launchSettings.json). Use `https://localhost:7217` if you run the `https` profile. */
  apiBaseUrl: devApiBaseUrl(localDevSecrets.authRedirectOrigin),
  supabaseUrl: 'https://kpvfrbgpbmlxkqqibpjp.supabase.co',
  supabaseAnonKey: localDevSecrets.supabaseAnonKey,
  authRedirectOrigin: localDevSecrets.authRedirectOrigin,
};
