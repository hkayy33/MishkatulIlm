import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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

  /** White nav links on home hero; dark links on other routes (e.g. legal pages). */
  readonly isHomeRoute = toSignal(
    merge(
      of(null),
      this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
    ).pipe(
      map(() => this.pathIsHome(this.router.url)),
      tap(() => this.menuOpen.set(false)),
    ),
    { initialValue: this.pathIsHome(this.router.url) },
  );

  private pathIsHome(url: string): boolean {
    const path = url.split('#')[0].split('?')[0];
    return path === '/' || path === '';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen()) return;
    const root = this.userMenuRef()?.nativeElement;
    if (root && !root.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen.set(false);
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

  closeUserMenu(): void {
    this.menuOpen.set(false);
  }

  onLogout(): void {
    this.closeUserMenu();
    this.auth.logout();
  }

  onProgramsClick(): void {
    this.programsNav.scrollToProgramsSection();
  }

  onProgramsKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      this.onProgramsClick();
    }
  }
}
