import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, Subscription, interval } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { AdminNavBadgeService } from '../../../core/services/admin-nav-badge.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayout implements OnInit, OnDestroy {
  protected readonly auth = inject(AuthService);
  protected readonly navBadges = inject(AdminNavBadgeService);
  private readonly router = inject(Router);

  protected readonly sidebarOpen = signal(false);

  protected readonly totalPending = computed(() => {
    const counts = this.navBadges.counts();
    return (
      counts.pendingApplications +
      counts.pendingScheduleChanges +
      counts.pendingPaymentSubmissions
    );
  });

  private sub = new Subscription();

  ngOnInit(): void {
    this.navBadges.refresh();
    this.sub.add(
      this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
        this.navBadges.refresh();
        this.sidebarOpen.set(false);
      }),
    );
    this.sub.add(interval(60_000).subscribe(() => this.navBadges.refresh()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  protected toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  protected closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  signOut(): void {
    this.auth.logout();
  }

  protected badgeLabel(count: number): string {
    if (count > 99) return '99+';
    return String(count);
  }
}
