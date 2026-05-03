import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, NgZone, PLATFORM_ID, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import {
  catchError,
  firstValueFrom,
  from,
  map,
  Observable,
  of,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import type { AuthUser, LoginRequest, RegisterRequest, RegisterResult } from '../models/auth.models';
import { UserSyncService } from './user-sync.service';

/**
 * Where Supabase redirects after the user clicks the email confirmation link.
 * Add this exact URL under Supabase → Authentication → URL Configuration → Redirect URLs
 * (include http://localhost:4200 for local dev).
 */
const AUTH_EMAIL_CALLBACK_PATH = '/auth/callback';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  private readonly userSync = inject(UserSyncService);

  private client: SupabaseClient | null = null;

  private readonly _accessToken = signal<string | null>(null);
  private readonly _user = signal<AuthUser | null>(null);

  readonly accessToken = this._accessToken.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => !!this._accessToken());

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!environment.supabaseUrl || !environment.supabaseAnonKey) return;

    this.client = this.createSupabaseClient();

    void this.client.auth.getSession().then(({ data }) => {
      this.zone.run(() => this.applySession(data.session));
    });

    this.client.auth.onAuthStateChange((_event, session) => {
      this.zone.run(() => this.applySession(session));
    });
  }

  private createSupabaseClient(): SupabaseClient {
    return createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: globalThis.sessionStorage,
        flowType: 'pkce',
        detectSessionInUrl: true,
      },
    });
  }

  private getAuthEmailRedirectUrl(): string {
    if (!isPlatformBrowser(this.platformId)) return '';
    return `${globalThis.location.origin}${AUTH_EMAIL_CALLBACK_PATH}`;
  }

  private getClient(): SupabaseClient {
    if (!isPlatformBrowser(this.platformId)) {
      throw new Error('Authentication is only available in the browser.');
    }
    if (!environment.supabaseUrl || !environment.supabaseAnonKey) {
      throw new Error(
        'Supabase is not configured. Set environment.supabaseUrl and environment.supabaseAnonKey.',
      );
    }
    this.client ??= this.createSupabaseClient();
    return this.client;
  }

  /**
   * Creates the `users` row in your API database (register/login only talk to Supabase until this runs).
   * Safe to call repeatedly; the server no-ops if the row already exists.
   */
  syncServerProfile(): Observable<void> {
    return this.userSync.syncWithBearer(this.getBearerToken());
  }

  register(body: RegisterRequest): Observable<RegisterResult> {
    const emailRedirectTo = this.getAuthEmailRedirectUrl();
    return from(
      this.getClient().auth.signUp({
        email: body.email,
        password: body.password,
        options: {
          emailRedirectTo: emailRedirectTo || undefined,
          data: {
            first_name: body.firstName,
            last_name: body.lastName,
            onboarding_completed: false,
          },
        },
      }),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) return throwError(() => error);
        const needsEmailConfirmation = !data.session && !!data.user;
        if (data.session) {
          this.applySession(data.session);
          return this.syncServerProfile().pipe(
            map(() => ({ needsEmailConfirmation: false } satisfies RegisterResult)),
          );
        }
        return of({ needsEmailConfirmation: true } satisfies RegisterResult);
      }),
    );
  }

  /** Resend the signup confirmation email (same redirect as register). */
  resendSignupConfirmation(email: string): Observable<void> {
    const redirectTo = this.getAuthEmailRedirectUrl();
    return from(
      this.getClient().auth.resend({
        type: 'signup',
        email: email.trim(),
        options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
      }),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
    );
  }

  /**
   * Completes email verification / magic-link return (PKCE `code` in URL, or session in hash).
   * Call from `/auth/callback` (and optionally `/login` if that URL is allowed as redirect).
   *
   * Supabase may already exchange the `code` via `detectSessionInUrl` before this runs; calling
   * `exchangeCodeForSession` again would fail and incorrectly send users to the error page.
   */
  async handleAuthRedirectResult(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const client = this.getClient();
    const href = globalThis.location?.href ?? '';

    try {
      let {
        data: { session },
        error: sessionError,
      } = await client.auth.getSession();
      if (sessionError) throw sessionError;

      const hasPkceCode = href.includes('code=');
      if (!session && hasPkceCode) {
        const { data, error } = await client.auth.exchangeCodeForSession(href);
        if (error) throw error;
        session = data.session;
      }

      this.zone.run(() => this.applySession(session));

      if (session) {
        await firstValueFrom(this.syncServerProfile().pipe(catchError(() => of(void 0))));
        const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
        const done = meta['onboarding_completed'] === true;
        await this.router.navigateByUrl(done ? '/' : '/onboarding', { replaceUrl: true });
      } else {
        await this.router.navigateByUrl('/login?authError=session', { replaceUrl: true });
      }
    } catch (ex) {
      console.warn('[AuthService] handleAuthRedirectResult:', ex);
      const {
        data: { session: recovered },
      } = await client.auth.getSession();
      if (recovered) {
        this.zone.run(() => this.applySession(recovered));
        await firstValueFrom(this.syncServerProfile().pipe(catchError(() => of(void 0))));
        const meta = (recovered.user.user_metadata ?? {}) as Record<string, unknown>;
        const done = meta['onboarding_completed'] === true;
        await this.router.navigateByUrl(done ? '/' : '/onboarding', { replaceUrl: true });
        return;
      }
      await this.router.navigateByUrl('/login?authError=verify', { replaceUrl: true });
    }
  }

  login(body: LoginRequest): Observable<void> {
    return from(
      this.getClient().auth.signInWithPassword({
        email: body.email,
        password: body.password,
      }),
    ).pipe(
      tap(({ data, error }) => {
        if (error) throw error;
        this.applySession(data.session);
      }),
      switchMap(() => this.syncServerProfile()),
    );
  }

  logout(): void {
    if (this.client) {
      void this.client.auth.signOut().then(() => {
        this.zone.run(() => this.clearSession());
        void this.router.navigate(['/login']);
      });
      return;
    }
    this.clearSession();
    void this.router.navigate(['/login']);
  }

  /** After onboarding is saved to the API, mirror completion into Supabase user metadata. */
  markOnboardingCompleted(): Observable<void> {
    const client = this.getClient();
    return from(client.auth.updateUser({ data: { onboarding_completed: true } })).pipe(
      switchMap(({ error }) => {
        if (error) return throwError(() => error);
        return from(client.auth.getSession());
      }),
      tap(({ data }) => this.applySession(data.session)),
      map(() => void 0),
    );
  }

  private applySession(session: Session | null): void {
    if (!session) {
      this.clearSession();
      return;
    }
    const u = session.user;
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    const firstName = String(meta['first_name'] ?? meta['firstName'] ?? '');
    const lastName = String(meta['last_name'] ?? meta['lastName'] ?? '');
    const onboardingCompleted = meta['onboarding_completed'] === true;

    this._accessToken.set(session.access_token);
    this._user.set({
      userId: u.id,
      email: u.email ?? '',
      firstName,
      lastName,
      onboardingCompleted,
    });
  }

  clearSession(): void {
    this._accessToken.set(null);
    this._user.set(null);
  }

  shouldAttachAuth(url: string): boolean {
    const base = environment.apiBaseUrl.replace(/\/$/, '');
    return url.startsWith(base) && !!this._accessToken();
  }

  getBearerToken(): string | null {
    return this._accessToken();
  }

  apiConfigured(): boolean {
    return environment.apiBaseUrl.replace(/\/$/, '').length > 0;
  }

  supabaseConfigured(): boolean {
    return !!environment.supabaseUrl && !!environment.supabaseAnonKey;
  }
}
