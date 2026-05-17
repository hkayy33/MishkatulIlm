import { Component, inject, OnDestroy, OnInit } from '@angular/core';
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

  private sub = new Subscription();

  ngOnInit(): void {
    this.navBadges.refresh();
    this.sub.add(
      this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
        this.navBadges.refresh();
      }),
    );
    this.sub.add(interval(60_000).subscribe(() => this.navBadges.refresh()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  signOut(): void {
    this.auth.logout();
  }

  protected badgeLabel(count: number): string {
    return count > 9 ? '+9+' : `+${count}`;
  }
}
