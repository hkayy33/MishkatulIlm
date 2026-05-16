import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, merge, of } from 'rxjs';
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

  protected readonly title = signal('MishkatulIlm-Client');

  protected readonly showMarketingShell = toSignal(
    merge(
      of(null),
      this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
    ).pipe(map(() => !this.isAdminRoute(this.router.url))),
    { initialValue: !this.isAdminRoute(this.router.url) },
  );

  private isAdminRoute(rawUrl: string): boolean {
    const path = rawUrl.split('#')[0]?.split('?')[0] ?? '';
    return path.startsWith('/admin');
  }
}
