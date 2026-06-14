import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';

/** Signals navbar “Programs” → scroll to What We Offer and reveal expanded topics. */
@Injectable({ providedIn: 'root' })
export class ProgramsSectionNavService {
  private readonly router = inject(Router);
  private readonly requests = new Subject<void>();
  private pendingScroll = false;

  readonly requests$ = this.requests.asObservable();

  navigateToProgramsSection(): void {
    if (this.isHomeRoute()) {
      this.requests.next();
      return;
    }

    this.pendingScroll = true;
    void this.router.navigate(['/']);
  }

  /** Called once the homepage programs section is mounted after cross-route navigation. */
  fulfillPendingScrollIfNeeded(): void {
    if (!this.pendingScroll) {
      return;
    }

    this.pendingScroll = false;
    window.setTimeout(() => this.requests.next(), 0);
  }

  private isHomeRoute(): boolean {
    const path = this.router.url.split('#')[0].split('?')[0];
    return path === '/' || path === '';
  }
}
