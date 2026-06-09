import { prodSecrets } from './environment.prod.local';

/**
 * Production defaults — overridden by `environment.deploy.ts` when using `npm run build:deploy`.
 * Set secrets in gitignored `environment.prod.local.ts` (see `npm postinstall` or DEPLOYMENT.md).
 */
export const environment = {
  production: true,
  apiBaseUrl: '',
  supabaseUrl: '',
  supabaseAnonKey: prodSecrets.supabaseAnonKey,
  authRedirectOrigin: undefined as string | undefined,
};
