/** Supabase `signUp` payload (stored in `options.data` user metadata). */
export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

/** Supabase signInWithPassword payload. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** App-specific view of the signed-in user (from Supabase session + metadata). */
export interface AuthUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  onboardingCompleted: boolean;
}

/** Result of register when email confirmation is enabled in Supabase. */
export interface RegisterResult {
  needsEmailConfirmation: boolean;
}
