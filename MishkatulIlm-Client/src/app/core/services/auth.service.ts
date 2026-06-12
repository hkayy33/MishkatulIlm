import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, NgZone, PLATFORM_ID, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import type { AuthChangeEvent, EmailOtpType, Session } from '@supabase/supabase-js';
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
import {
  backupPkceVerifierFromSignup,
  buildSupabasePkceVerifyUrl,
  getAuthEmailRedirectUrl,
  hasAuthCallbackParams,
  isPkceEmailToken,
  PENDING_SIGNUP_EMAIL_KEY,
  PENDING_PKCE_VERIFIER_KEY,
  restorePkceVerifierBackup,
} from '../supabase/auth-redirect';
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
  private postAuthLandingPromise: Promise<void> | null = null;

  private readonly _accessToken = signal<string | null>(null);
  private readonly _user = signal<AuthUser | null>(null);

  readonly accessToken = this._accessToken.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => !!this._accessToken());

  constructor() {
    // Auth listener is registered from initSession so PKCE verifier restore runs first.
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

    const href = globalThis.location?.href ?? '';
    const path = globalThis.location?.pathname ?? '';
    const onCallback = path === '/auth/callback' || path.endsWith('/auth/callback');
    const authLanding = hasAuthCallbackParams(href) || onCallback;

    if (authLanding) {
      restorePkceVerifierBackup();
    }

    const applyInitSession = (session: Session | null, error?: unknown) => {
      if (error) console.warn('[AuthService] initSession getSession:', error);
      this.zone.run(() => {
        if (session) {
          this.applySession(session);
          this.pushSessionToServer();
        }
        this.markSessionReady();
      });
      if (session && authLanding) {
        this.authRedirectHandled = true;
        const newSignup = href.includes('code=') || href.includes('token_hash=');
        void this.finishAuthenticatedRedirect(newSignup);
      }
    };

    // Email confirmation landing: exchange ?code= via Supabase before anything else runs.
    if (authLanding) {
      return getSupabaseBrowserClient()
        .auth.getSession()
        .then(({ data, error }) => {
          applyInitSession(data.session, error);
          this.registerAuthListener();
        })
        .catch((err) => {
          console.warn('[AuthService] initSession failed:', err);
          this.markSessionReady();
          this.registerAuthListener();
        });
    }

    this.registerAuthListener();
    return getSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data, error }) => {
        applyInitSession(data.session, error);
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
    return from(this.sessionReady).pipe(
      switchMap(() => {
        if (this.isAuthenticated()) return of(true);
        return from(getSupabaseBrowserClient().auth.getSession()).pipe(
          map(({ data: { session } }) => {
            if (session) {
              this.applySession(session);
              return true;
            }
            return false;
          }),
        );
      }),
    );
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
      tap((result) => {
        if (result.needsEmailConfirmation && isPlatformBrowser(this.platformId)) {
          try {
            sessionStorage.setItem(PENDING_SIGNUP_EMAIL_KEY, body.email.trim());
            backupPkceVerifierFromSignup();
          } catch {
            // ignore private mode / blocked storage
          }
        }
      }),
    );
  }

  /** Confirms signup with the 6-digit code from the email (`{{ .Token }}`). Works in any browser — no PKCE. */
  verifySignupOtpCode(email: string, token: string): Observable<void> {
    const normalizedEmail = email.trim();
    const normalizedToken = token.trim();
    const types: EmailOtpType[] = ['signup', 'email'];

    const tryType = (index: number): Observable<void> => {
      if (index >= types.length) {
        return throwError(() => new Error('Invalid or expired confirmation code.'));
      }
      return from(
        this.getClient().auth.verifyOtp({
          email: normalizedEmail,
          token: normalizedToken,
          type: types[index]!,
        }),
      ).pipe(
        switchMap(({ data, error }) => {
          if (error) {
            if (index + 1 < types.length) return tryType(index + 1);
            return throwError(() => error);
          }
          if (!data.session) {
            return throwError(() => new Error('Could not start a session. Try signing in with your password.'));
          }
          this.applySession(data.session);
          this.clearPendingSignupEmail();
          return this.syncServerProfile().pipe(
            switchMap(() => this.refreshServerProfile().pipe(catchError(() => of(void 0)))),
            map(() => void 0),
          );
        }),
      );
    };

    return tryType(0);
  }

  private clearPendingSignupEmail(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      sessionStorage.removeItem(PENDING_SIGNUP_EMAIL_KEY);
      sessionStorage.removeItem(PENDING_PKCE_VERIFIER_KEY);
    } catch {
      // ignore
    }
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
      tap(() => {
        if (isPlatformBrowser(this.platformId)) {
          backupPkceVerifierFromSignup();
        }
      }),
    );
  }

  /** After email verification, finish redirect to onboarding/dashboard from any landing URL. */
  completePostAuthLanding(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !isSupabaseConfigured()) {
      return Promise.resolve();
    }

    this.postAuthLandingPromise ??= this.runCompletePostAuthLanding().finally(() => {
      this.postAuthLandingPromise = null;
    });
    return this.postAuthLandingPromise;
  }

  private async runCompletePostAuthLanding(): Promise<void> {
    await firstValueFrom(this.whenSessionReady$());

    const href = globalThis.location?.href ?? '';
    const onCallback = this.isAuthCallbackRoute();
    const newSignup = href.includes('code=') || href.includes('token_hash=');

    if (this.isAuthenticated() && (hasAuthCallbackParams(href) || onCallback)) {
      await this.finishAuthenticatedRedirect(newSignup);
      return;
    }

    if (hasAuthCallbackParams(href)) {
      await this.handleAuthRedirectResult();
      return;
    }

    if (onCallback) {
      if (this.isAuthenticated()) {
        await this.finishAuthenticatedRedirect(newSignup);
        return;
      }

      const recovered = await this.tryRecoverSessionFromCallback(this.getClient());
      if (recovered) {
        this.zone.run(() => this.applySession(recovered));
        await this.finishAuthenticatedRedirect(newSignup);
        return;
      }

      await this.navigateAfterFailedAuthCallback(href);
      return;
    }

    if (!this.isAuthenticated() || !this.isMarketingHomePath()) return;

    const u = this._user();
    if (!u || u.isAdmin || u.onboardingCompleted) return;

    await this.finishAuthenticatedRedirect();
  }

  async handleAuthRedirectResult(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const href = globalThis.location?.href ?? '';
    const pendingAuthCallback = hasAuthCallbackParams(href);
    const onCallback = this.isAuthCallbackRoute();
    const newSignup = href.includes('code=') || href.includes('token_hash=');

    if (this.isAuthenticated() && (pendingAuthCallback || onCallback)) {
      await this.finishAuthenticatedRedirect(newSignup);
      return;
    }

    if (this.authRedirectHandled) {
      if (this.isAuthenticated() && (pendingAuthCallback || onCallback)) {
        await this.finishAuthenticatedRedirect(newSignup);
      } else if (onCallback && !this.isAuthenticated()) {
        const recovered = await this.tryRecoverSessionFromCallback(this.getClient());
        if (recovered) {
          this.zone.run(() => this.applySession(recovered));
          await this.finishAuthenticatedRedirect(newSignup);
          return;
        }
        await this.navigateAfterFailedAuthCallback(href, 'verify');
      }
      return;
    }

    if (!pendingAuthCallback) {
      if (onCallback && this.isAuthenticated()) {
        await this.finishAuthenticatedRedirect(newSignup);
      }
      return;
    }

    this.authRedirectHandled = true;

    const client = this.getClient();
    const emailOtp = this.parseEmailOtpCallback(href);
    const hasPkceCode = (() => {
      try {
        return new URL(href).searchParams.has('code');
      } catch {
        return href.includes('code=');
      }
    })();
    const redirectAsNewSignup =
      emailOtp?.type === 'signup' ||
      emailOtp?.type === 'email' ||
      (hasPkceCode && !emailOtp);

    // PKCE tokens in token_hash must go through Supabase verify (confirms email + returns ?code=).
    if (emailOtp && isPkceEmailToken(emailOtp.tokenHash)) {
      const verifyUrl = buildSupabasePkceVerifyUrl(emailOtp.tokenHash);
      if (verifyUrl) {
        this.authRedirectHandled = true;
        globalThis.location.assign(verifyUrl);
        return;
      }
    }

    try {
      let session: Session | null = null;

      if (emailOtp) {
        const otpResult = await this.verifyEmailOtpSession(
          client,
          emailOtp.tokenHash,
          emailOtp.type,
        );
        if (otpResult.session) {
          session = otpResult.session;
        } else if (otpResult.confirmed) {
          session = await this.waitForAuthSession(client);
        } else {
          throw new Error('Email confirmation link is invalid or expired.');
        }
      }

      if (!session) {
        session = await this.parseImplicitHashSession(client);
      }

      if (!session && hasPkceCode) {
        restorePkceVerifierBackup();
        const {
          data: { session: urlSession },
          error: urlSessionError,
        } = await client.auth.getSession();
        if (urlSessionError) {
          console.warn('[AuthService] getSession after confirmation redirect:', urlSessionError.message);
        }
        session = urlSession;
      }

      if (!session) {
        session = await this.exchangePkceCodeSession(client, href);
      }

      if (!session) {
        const {
          data: { session: stored },
          error: sessionError,
        } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        session = stored;
      }

      this.zone.run(() => {
        if (session) this.applySession(session);
      });

      if (session) {
        await this.finishAuthenticatedRedirect(redirectAsNewSignup);
      } else {
        await this.navigateAfterFailedAuthCallback(href);
      }
    } catch (ex) {
      console.warn('[AuthService] handleAuthRedirectResult:', ex);
      const {
        data: { session: recovered },
      } = await client.auth.getSession();
      if (recovered) {
        this.zone.run(() => this.applySession(recovered));
        await this.finishAuthenticatedRedirect(redirectAsNewSignup);
        return;
      }
      await this.navigateAfterFailedAuthCallback(href, 'verify');
    }
  }

  /**
   * When Supabase ConfirmationURL confirms email but PKCE exchange fails (e.g. different browser),
   * the user still needs to sign in — not a generic "session" failure.
   */
  private async navigateAfterFailedAuthCallback(
    href: string,
    fallback: 'session' | 'verify' = 'session',
  ): Promise<void> {
    try {
      const url = new URL(href);
      if (url.searchParams.has('code')) {
        this.stripAuthCallbackParamsFromUrl();
        // Email is confirmed by Supabase before redirect; only the auto sign-in failed.
        await this.router.navigateByUrl('/login?confirmed=1', { replaceUrl: true });
        return;
      }
    } catch {
      // ignore malformed URLs
    }

    const err = fallback === 'verify' ? 'verify' : 'session';
    await this.router.navigateByUrl(`/login?authError=${err}`, { replaceUrl: true });
  }

  private isAuthCallbackRoute(): boolean {
    const path = globalThis.location?.pathname ?? '';
    return path === '/auth/callback' || path.endsWith('/auth/callback');
  }

  private isMarketingHomePath(): boolean {
    const path = globalThis.location?.pathname ?? '';
    return path === '' || path === '/';
  }

  private async finishAuthenticatedRedirect(newSignup = false): Promise<void> {
    this.clearPendingSignupEmail();
    await this.navigateAfterAuthenticated(newSignup);
    this.stripAuthCallbackParamsFromUrl();
    void firstValueFrom(this.syncServerProfile().pipe(catchError(() => of(void 0))));
    void firstValueFrom(this.refreshServerProfile().pipe(catchError(() => of(void 0))));
  }

  /** Remove ?code= / hash tokens from the address bar after a successful auth redirect. */
  private stripAuthCallbackParamsFromUrl(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const url = new URL(globalThis.location.href);
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
      const hadQuery =
        url.searchParams.has('code') ||
        url.searchParams.has('token_hash') ||
        url.searchParams.has('type') ||
        url.searchParams.has('error') ||
        url.searchParams.has('error_description');
      const hadHash =
        hashParams.has('access_token') || hashParams.has('error') || hashParams.has('code');

      if (!hadQuery && !hadHash) return;

      url.searchParams.delete('code');
      url.searchParams.delete('token_hash');
      url.searchParams.delete('type');
      url.searchParams.delete('error');
      url.searchParams.delete('error_description');
      url.hash = '';
      globalThis.history.replaceState(globalThis.history.state, '', url.pathname + url.search);
    } catch {
      // ignore malformed URLs
    }
  }

  /** Tries hash tokens, PKCE code exchange, then stored session — used when callback params were already consumed. */
  private async tryRecoverSessionFromCallback(
    client: ReturnType<AuthService['getClient']>,
  ): Promise<Session | null> {
    const hashSession = await this.parseImplicitHashSession(client);
    if (hashSession) return hashSession;

    const href = globalThis.location?.href ?? '';
    const pkceSession = await this.exchangePkceCodeSession(client, href);
    if (pkceSession) return pkceSession;

    const {
      data: { session },
    } = await client.auth.getSession();
    return session;
  }

  private async exchangePkceCodeSession(
    client: ReturnType<AuthService['getClient']>,
    href: string,
  ): Promise<Session | null> {
    try {
      const url = new URL(href);
      const code = url.searchParams.get('code')?.trim();
      if (!code) return null;

      const exchange = async (): Promise<Session | null> => {
        restorePkceVerifierBackup();
        const { data, error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;
        return data.session;
      };

      try {
        return await exchange();
      } catch (first) {
        console.warn('[AuthService] exchangeCodeForSession:', first);
        if (!restorePkceVerifierBackup()) return null;
        const { data, error } = await client.auth.exchangeCodeForSession(code);
        if (error) {
          console.warn('[AuthService] exchangeCodeForSession retry:', error.message);
          return null;
        }
        return data.session;
      }
    } catch (ex) {
      console.warn('[AuthService] exchangeCodeForSession:', ex);
      return null;
    }
  }

  private parseEmailOtpCallback(href: string): { tokenHash: string; type: EmailOtpType } | null {
    try {
      const url = new URL(href);
      const raw = url.searchParams.get('token_hash');
      const tokenHash = raw?.trim() ?? '';
      if (!tokenHash) return null;

      const typeParam = url.searchParams.get('type')?.trim() || 'email';
      const allowed: EmailOtpType[] = [
        'signup',
        'email',
        'recovery',
        'invite',
        'email_change',
        'magiclink',
      ];
      const type = allowed.includes(typeParam as EmailOtpType)
        ? (typeParam as EmailOtpType)
        : 'signup';
      return { tokenHash, type };
    } catch {
      return null;
    }
  }

  /** Parses `#access_token=...&refresh_token=...` from implicit-flow email confirmation. */
  private async parseImplicitHashSession(
    client: ReturnType<AuthService['getClient']>,
  ): Promise<Session | null> {
    const hash = globalThis.location?.hash?.replace(/^#/, '') ?? '';
    if (!hash) return null;

    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) return null;

    const { data, error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      console.warn('[AuthService] setSession from hash:', error.message);
      return null;
    }
    return data.session;
  }

  /** Tries email then signup — Supabase signup confirmation uses type <c>email</c> for token_hash. */
  private async verifyEmailOtpSession(
    client: ReturnType<AuthService['getClient']>,
    tokenHash: string,
    type: EmailOtpType,
  ): Promise<{ session: Session | null; confirmed: boolean }> {
    const types: EmailOtpType[] =
      type === 'email' ? ['email', 'signup'] : type === 'signup' ? ['email', 'signup'] : [type, 'email'];

    for (const otpType of types) {
      const { data, error } = await client.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });
      if (!error && data.session) return { session: data.session, confirmed: true };
      if (!error && data.user) return { session: null, confirmed: true };
      if (error) console.warn('[AuthService] verifyOtp:', otpType, error.message);
    }

    const restSession = await this.verifyEmailOtpViaRest(tokenHash, types);
    if (restSession) return { session: restSession, confirmed: true };

    const serverSession = await this.verifyEmailOtpViaServer(tokenHash, type);
    if (serverSession) return { session: serverSession, confirmed: true };

    return { session: null, confirmed: false };
  }

  private async verifyEmailOtpViaRest(
    tokenHash: string,
    types: EmailOtpType[],
  ): Promise<Session | null> {
    if (!environment.supabaseUrl || !environment.supabaseAnonKey) return null;

    for (const otpType of types) {
      try {
        const res = await fetch(`${environment.supabaseUrl.replace(/\/$/, '')}/auth/v1/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: environment.supabaseAnonKey,
            Authorization: `Bearer ${environment.supabaseAnonKey}`,
          },
          body: JSON.stringify(
            tokenHash.startsWith('pkce_')
              ? { token: tokenHash, type: otpType }
              : { token_hash: tokenHash, type: otpType },
          ),
        });
        const body = (await res.json()) as {
          access_token?: string;
          refresh_token?: string;
          msg?: string;
        };
        if (!res.ok) {
          console.warn('[AuthService] verify REST:', otpType, body.msg ?? res.status);
          continue;
        }
        if (!body.access_token || !body.refresh_token) continue;

        const { data, error } = await getSupabaseBrowserClient().auth.setSession({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
        });
        if (error) {
          console.warn('[AuthService] setSession after REST verify:', error.message);
          continue;
        }
        return data.session;
      } catch (ex) {
        console.warn('[AuthService] verifyEmailOtpViaRest:', ex);
      }
    }
    return null;
  }

  private async verifyEmailOtpViaServer(
    tokenHash: string,
    type: EmailOtpType,
  ): Promise<Session | null> {
    if (!this.apiConfigured()) return null;

    try {
      const base = environment.apiBaseUrl.replace(/\/$/, '');
      const res = await firstValueFrom(
        this.http.post<{
          accessToken: string;
          refreshToken: string;
        }>(`${base}/api/auth/verify-email-callback`, {
          tokenHash,
          type,
        }),
      );
      if (!res.accessToken || !res.refreshToken) return null;

      const { data, error } = await getSupabaseBrowserClient().auth.setSession({
        access_token: res.accessToken,
        refresh_token: res.refreshToken,
      });
      if (error) {
        console.warn('[AuthService] setSession after server verify:', error.message);
        return null;
      }
      return data.session;
    } catch (ex) {
      console.warn('[AuthService] verifyEmailOtpViaServer:', ex);
      return null;
    }
  }

  /** After verifyOtp, Supabase may persist the session slightly after the API response. */
  private waitForAuthSession(
    client: ReturnType<AuthService['getClient']>,
    timeoutMs = 5000,
  ): Promise<Session | null> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (session: Session | null) => {
        if (settled) return;
        settled = true;
        subscription.unsubscribe();
        clearTimeout(timer);
        resolve(session);
      };

      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((event, session) => {
        if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
          finish(session);
        }
      });

      void client.auth.getSession().then(({ data: { session } }) => {
        if (session) finish(session);
      });

      const timer = setTimeout(() => finish(null), timeoutMs);
    });
  }

  private async navigateAfterAuthenticated(newSignup = false): Promise<void> {
    if (newSignup) {
      await this.router.navigateByUrl('/onboarding', { replaceUrl: true });
      return;
    }

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
        this.clearPendingSignupEmail();
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
