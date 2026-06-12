import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, NgZone, PLATFORM_ID, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
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
import { getAuthEmailRedirectUrl, hasAuthCallbackParams } from '../supabase/auth-redirect';
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from '../supabase/supabase-browser.client';
import { UserProfileService } from './user-profile.service';
import { UserSyncService } from './user-sync.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  private readonly userSync = inject(UserSyncService);
  private readonly userProfile = inject(UserProfileService);

  private sessionReadyResolve: (() => void) | null = null;
  private readonly sessionReady = new Promise<void>((resolve) => {
    this.sessionReadyResolve = resolve;
  });

  private authListenerRegistered = false;
  private authRedirectHandled = false;

  private readonly _accessToken = signal<string | null>(null);
  private readonly _user = signal<AuthUser | null>(null);

  readonly accessToken = this._accessToken.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => !!this._accessToken());

  constructor() {
    if (!isPlatformBrowser(this.platformId) || !isSupabaseConfigured()) return;
    this.registerAuthListener();
  }

  /**
   * Restores session from Supabase storage before the app renders protected routes.
   * Called from {@link provideAppInitializer} in the browser only.
   */
  initSession(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !isSupabaseConfigured()) {
      this.markSessionReady();
      return Promise.resolve();
    }

    this.registerAuthListener();

    // PKCE callback is handled on /auth/callback after the router is ready (see AuthCallback).
    return getSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data, error }) => {
        if (error) console.warn('[AuthService] initSession getSession:', error);
        this.zone.run(() => {
          if (data.session) {
            this.applySession(data.session);
            this.pushSessionToServer();
          }
          this.markSessionReady();
        });
      })
      .catch((err) => {
        console.warn('[AuthService] initSession failed:', err);
        this.markSessionReady();
      });
  }

  private markSessionReady(): void {
    this.sessionReadyResolve?.();
    this.sessionReadyResolve = null;
  }

  private registerAuthListener(): void {
    if (this.authListenerRegistered || !isPlatformBrowser(this.platformId)) return;
    this.authListenerRegistered = true;

    getSupabaseBrowserClient().auth.onAuthStateChange((event, session) => {
      this.zone.run(() => this.handleAuthStateChange(event, session));
    });
  }

  /**
   * Only clear the session on explicit sign-out. Supabase may emit null session during
   * transient states; clearing there caused logout after onboarding and failed API calls.
   */
  private handleAuthStateChange(event: AuthChangeEvent, session: Session | null): void {
    if (session) {
      this.applySession(session);
      if (
        event === 'SIGNED_IN' ||
        event === 'INITIAL_SESSION' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        this.pushSessionToServer();
      }
      return;
    }

    if (event === 'SIGNED_OUT') {
      this.clearSession();
    }
  }

  private pushSessionToServer(): void {
    if (!this.apiConfigured() || !this._accessToken()) return;
    void firstValueFrom(
      this.syncServerProfile().pipe(
        switchMap(() => this.refreshServerProfile().pipe(catchError(() => of(void 0)))),
        catchError(() => of(void 0)),
      ),
    );
  }

  private getClient() {
    if (!isPlatformBrowser(this.platformId)) {
      throw new Error('Authentication is only available in the browser.');
    }
    return getSupabaseBrowserClient();
  }

  /**
   * Reads the current access token from Supabase (storage + refresh), updates in-memory state,
   * and returns the token for API calls. Prefer this over {@link getBearerToken} for HTTP requests.
   */
  getBearerToken$(): Observable<string | null> {
    if (!isPlatformBrowser(this.platformId) || !isSupabaseConfigured()) {
      return of(null);
    }
    return from(getSupabaseBrowserClient().auth.getSession()).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (data.session) {
          this.applySession(data.session);
          return data.session.access_token;
        }
        return null;
      }),
      catchError((err) => {
        console.warn('[AuthService] getBearerToken$:', err);
        return of(this._accessToken());
      }),
    );
  }

  /** @deprecated Prefer {@link getBearerToken$} so the token matches Supabase storage. */
  refreshSessionBeforeApi(): Observable<void> {
    return this.getBearerToken$().pipe(map(() => void 0));
  }

  whenSessionReady$(): Observable<boolean> {
    if (!isPlatformBrowser(this.platformId)) return of(false);
    return from(this.sessionReady).pipe(map(() => this.isAuthenticated()));
  }

  isApiRequest(url: string): boolean {
    const base = environment.apiBaseUrl.replace(/\/$/, '');
    return base.length > 0 && url.startsWith(base);
  }

  syncServerProfile(): Observable<void> {
    return this.getBearerToken$().pipe(
      switchMap((token) => this.userSync.syncWithBearer(token)),
    );
  }

  refreshServerProfile(): Observable<void> {
    return this.getBearerToken$().pipe(
      switchMap((token) => {
        if (!token || !this.apiConfigured()) return of(void 0);
        return this.userProfile.getMe(token).pipe(
          tap((me) => {
            this._user.set({
              userId: me.userId,
              email: me.email,
              firstName: me.firstName,
              lastName: me.lastName,
              onboardingCompleted: me.onboardingCompleted,
              isAdmin: me.isAdmin,
            });
          }),
          map(() => void 0),
        );
      }),
    );
  }

  register(body: RegisterRequest): Observable<RegisterResult> {
    const emailRedirectTo = getAuthEmailRedirectUrl();
    return from(
      this.getClient().auth.signUp({
        email: body.email,
        password: body.password,
        options: {
          emailRedirectTo,
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
            switchMap(() => this.refreshServerProfile().pipe(catchError(() => of(void 0)))),
            map(() => ({ needsEmailConfirmation: false } satisfies RegisterResult)),
          );
        }
        return of({ needsEmailConfirmation: true } satisfies RegisterResult);
      }),
    );
  }

  /** Dev-only: server builds a confirmation URL that bypasses Supabase email templates. */
  fetchDevSignupConfirmationLink(email: string): Observable<{ actionLink: string; redirectTo: string }> {
    const redirectTo = isPlatformBrowser(this.platformId) ? getAuthEmailRedirectUrl() : '';
    const base = environment.apiBaseUrl.replace(/\/$/, '');
    return this.http.post<{ actionLink: string; redirectTo: string }>(
      `${base}/api/dev/signup-confirmation-link`,
      { email: email.trim(), redirectTo: redirectTo || undefined },
    );
  }

  /** Dev-only: confirm signup via Supabase admin API (no email link or redirect URL). */
  confirmDevSignup(email: string): Observable<{ message: string; alreadyConfirmed: boolean }> {
    const base = environment.apiBaseUrl.replace(/\/$/, '');
    return this.http.post<{ message: string; alreadyConfirmed: boolean }>(
      `${base}/api/dev/confirm-signup`,
      { email: email.trim() },
    );
  }

  resendSignupConfirmation(email: string): Observable<void> {
    const emailRedirectTo = getAuthEmailRedirectUrl();
    return from(
      this.getClient().auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo },
      }),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
    );
  }

  async handleAuthRedirectResult(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const href = globalThis.location?.href ?? '';
    const onCallbackRoute = this.isAuthCallbackRoute();

    if (this.authRedirectHandled) {
      if (onCallbackRoute && this.isAuthenticated()) {
        await this.finishAuthenticatedRedirect();
      }
      return;
    }

    if (!hasAuthCallbackParams(href)) {
      if (onCallbackRoute && this.isAuthenticated()) {
        await this.finishAuthenticatedRedirect();
      }
      return;
    }

    this.authRedirectHandled = true;

    const client = this.getClient();

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

      this.zone.run(() => {
        if (session) this.applySession(session);
      });

      if (session) {
        await this.finishAuthenticatedRedirect();
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
        await this.finishAuthenticatedRedirect();
        return;
      }
      await this.router.navigateByUrl('/login?authError=verify', { replaceUrl: true });
    }
  }

  private isAuthCallbackRoute(): boolean {
    const path = globalThis.location?.pathname ?? '';
    return path === '/auth/callback' || path.endsWith('/auth/callback');
  }

  private async finishAuthenticatedRedirect(): Promise<void> {
    await firstValueFrom(this.syncServerProfile().pipe(catchError(() => of(void 0))));
    await firstValueFrom(this.refreshServerProfile().pipe(catchError(() => of(void 0))));
    await this.navigateAfterAuthenticated();
  }

  private async navigateAfterAuthenticated(): Promise<void> {
    const u = this._user();
    if (u?.isAdmin) {
      await this.router.navigateByUrl('/admin', { replaceUrl: true });
      return;
    }
    if (u?.onboardingCompleted) {
      await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
      return;
    }
    await this.router.navigateByUrl('/onboarding', { replaceUrl: true });
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
      switchMap(() => this.refreshServerProfile().pipe(catchError(() => of(void 0)))),
    );
  }

  logout(): void {
    void this.getClient()
      .auth.signOut()
      .then(() => {
        this.zone.run(() => {
          this.clearSession();
          void this.router.navigate(['/login']);
        });
      })
      .catch(() => {
        this.clearSession();
        void this.router.navigate(['/login']);
      });
  }

  markOnboardingCompleted(): Observable<void> {
    const tokenBefore = this._accessToken();
    return from(
      this.getClient().auth.updateUser({ data: { onboarding_completed: true } }),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) return throwError(() => error);
        this.patchUserFromSupabase(data.user, { onboardingCompleted: true });
        return of(void 0);
      }),
      catchError((err) => {
        if (tokenBefore) this._accessToken.set(tokenBefore);
        return throwError(() => err);
      }),
    );
  }

  private patchUserFromSupabase(
    supabaseUser: Session['user'] | null | undefined,
    overrides?: Partial<Pick<AuthUser, 'onboardingCompleted' | 'firstName' | 'lastName'>>,
  ): void {
    if (!supabaseUser) return;
    const prev = this._user();
    const meta = (supabaseUser.user_metadata ?? {}) as Record<string, unknown>;
    this._user.set({
      userId: supabaseUser.id,
      email: supabaseUser.email ?? prev?.email ?? '',
      firstName:
        overrides?.firstName ??
        String(meta['first_name'] ?? meta['firstName'] ?? prev?.firstName ?? ''),
      lastName:
        overrides?.lastName ??
        String(meta['last_name'] ?? meta['lastName'] ?? prev?.lastName ?? ''),
      onboardingCompleted:
        overrides?.onboardingCompleted ??
        (meta['onboarding_completed'] === true || (prev?.onboardingCompleted ?? false)),
      isAdmin: prev?.isAdmin ?? false,
    });
  }

  private applySession(session: Session): void {
    const prevAdmin = this._user()?.isAdmin ?? false;
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
      isAdmin: prevAdmin,
    });
  }

  clearSession(): void {
    this._accessToken.set(null);
    this._user.set(null);
  }

  /** @deprecated Use {@link isApiRequest} in the interceptor. */
  shouldAttachAuth(url: string): boolean {
    return this.isApiRequest(url);
  }

  getBearerToken(): string | null {
    return this._accessToken();
  }

  apiConfigured(): boolean {
    return environment.apiBaseUrl.replace(/\/$/, '').length > 0;
  }

  supabaseConfigured(): boolean {
    return isSupabaseConfigured();
  }
}
