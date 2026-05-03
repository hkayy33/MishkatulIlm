import { computed, signal } from '@angular/core';
import { of } from 'rxjs';
import type { AuthUser, RegisterResult } from '../models/auth.models';
import { AuthService } from '../services/auth.service';

/** Minimal `AuthService` stand-in for unit tests (no Supabase). */
export function createAuthServiceStub(): AuthService {
  const token = signal<string | null>(null);
  const user = signal<AuthUser | null>(null);

  return {
    accessToken: token.asReadonly(),
    user: user.asReadonly(),
    isAuthenticated: computed(() => !!token()),
    register: () => of({ needsEmailConfirmation: false } satisfies RegisterResult),
    login: () => {
      token.set('test-token');
      user.set({
        userId: '00000000-0000-0000-0000-000000000001',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        onboardingCompleted: false,
      });
      return of(void 0);
    },
    logout: () => {
      token.set(null);
      user.set(null);
    },
    markOnboardingCompleted: () => of(void 0),
    resendSignupConfirmation: () => of(void 0),
    handleAuthRedirectResult: () => Promise.resolve(),
    syncServerProfile: () => of(void 0),
    clearSession: () => {
      token.set(null);
      user.set(null);
    },
    shouldAttachAuth: () => false,
    getBearerToken: () => token(),
    apiConfigured: () => true,
    supabaseConfigured: () => true,
  } as unknown as AuthService;
}
