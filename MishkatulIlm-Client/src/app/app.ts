import { afterNextRender, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, merge, of } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { isAuthCallbackRoute } from './core/supabase/auth-redirect';
import { NavBar } from './shared/nav-bar/nav-bar';
import { Footer } from './shared/footer/footer';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavBar, Footer],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly title = signal('MishkatulIlm-Client');

  constructor() {
    // Handle email-verification landing on Site URL root (/?code=... or /?token_hash=...).
    afterNextRender(() => {
      const path = globalThis.location?.pathname ?? '';
      const href = globalThis.location?.href ?? '';
      const onCallback = isAuthCallbackRoute(path);
      if (onCallback) return;
      if (
        !href.includes('code=') &&
        !href.includes('token_hash=') &&
        !href.includes('access_token=') &&
        !href.includes('error=')
      ) {
        return;
      }
      void this.auth.completePostAuthLanding();
    });
  }

  protected readonly showMarketingShell = toSignal(
    merge(
      of(null),
      this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
    ).pipe(map(() => !this.isStandaloneAppRoute(this.router.url))),
    { initialValue: !this.isStandaloneAppRoute(this.router.url) },
  );

  private isStandaloneAppRoute(rawUrl: string): boolean {
    const path = rawUrl.split('#')[0]?.split('?')[0] ?? '';
    return path.startsWith('/admin');
  }
}
