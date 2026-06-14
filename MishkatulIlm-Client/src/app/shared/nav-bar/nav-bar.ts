import {
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, merge, of, tap } from 'rxjs';
import { GetStartedBtn } from '../../components/get-started-btn/get-started-btn';
import { AuthService } from '../../core/services/auth.service';
import { ProgramsSectionNavService } from '../../services/programs-section-nav.service';

@Component({
  selector: 'app-nav-bar',
  imports: [GetStartedBtn, RouterLink],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.scss',
  host: {
    '(document:keydown.escape)': 'onEscape($event)',
  },
})
export class NavBar {
  private readonly router = inject(Router);
  private readonly programsNav = inject(ProgramsSectionNavService);
  protected readonly auth = inject(AuthService);

  private readonly userMenuRef = viewChild<ElementRef<HTMLElement>>('userMenu');

  protected readonly menuOpen = signal(false);

  protected readonly userFirstName = computed(() => {
    const name = this.auth.user()?.firstName?.trim();
    return name || 'Account';
  });

  protected readonly dashboardLink = computed(() =>
    this.auth.user()?.isAdmin ? '/admin' : '/dashboard',
  );

  readonly mobileMenuOpen = signal(false);

  /** White nav links on home hero; dark links on other routes (e.g. legal pages). */
  readonly isHomeRoute = toSignal(
    merge(
      of(null),
      this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
    ).pipe(
      map(() => this.pathIsHome(this.router.url)),
      tap(() => this.closeMenus()),
    ),
    { initialValue: this.pathIsHome(this.router.url) },
  );

  readonly isAboutRoute = toSignal(
    merge(
      of(null),
      this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
    ).pipe(map(() => this.pathIsAbout(this.router.url))),
    { initialValue: this.pathIsAbout(this.router.url) },
  );

  readonly isPricingRoute = toSignal(
    merge(
      of(null),
      this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
    ).pipe(map(() => this.pathIsPricing(this.router.url))),
    { initialValue: this.pathIsPricing(this.router.url) },
  );

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closeMenus());

    effect((onCleanup) => {
      const open = this.mobileMenuOpen();
      if (typeof document === 'undefined') {
        return;
      }

      document.body.style.overflow = open ? 'hidden' : '';
      onCleanup(() => {
        document.body.style.overflow = '';
      });
    });
  }

  private pathIsHome(url: string): boolean {
    const path = url.split('#')[0].split('?')[0];
    return path === '/' || path === '';
  }

  private pathIsAbout(url: string): boolean {
    const path = url.split('#')[0].split('?')[0];
    return path === '/about';
  }

  private pathIsPricing(url: string): boolean {
    const path = url.split('#')[0].split('?')[0];
    return path === '/pricing';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen()) {
      return;
    }

    const root = this.userMenuRef()?.nativeElement;
    if (root && !root.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }

  toggleMobileMenu(): void {
    this.menuOpen.set(false);
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  closeMenus(): void {
    this.closeMobileMenu();
    this.menuOpen.set(false);
  }

  onEscape(event: Event): void {
    if (this.mobileMenuOpen()) {
      event.preventDefault();
      this.closeMobileMenu();
      return;
    }

    if (this.menuOpen()) {
      this.menuOpen.set(false);
    }
  }

  toggleUserMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((open) => !open);
  }

  onUserMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.menuOpen.update((open) => !open);
    }
  }

  onLogout(): void {
    this.closeMenus();
    this.auth.logout();
  }

  onProgramsClick(): void {
    this.programsNav.navigateToProgramsSection();
    this.closeMobileMenu();
  }

  onProgramsKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      this.onProgramsClick();
    }
  }
}
