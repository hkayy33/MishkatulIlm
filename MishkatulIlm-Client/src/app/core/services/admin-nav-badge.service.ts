import { inject, Injectable, signal } from '@angular/core';
import { AdminApiService, type AdminBadgeCounts } from './admin-api.service';

@Injectable({ providedIn: 'root' })
export class AdminNavBadgeService {
  private readonly adminApi = inject(AdminApiService);

  readonly counts = signal<AdminBadgeCounts>({
    pendingApplications: 0,
    pendingScheduleChanges: 0,
  });

  refresh(): void {
    this.adminApi.getBadgeCounts().subscribe({
      next: (counts) => this.counts.set(normalizeBadgeCounts(counts)),
      error: () => {},
    });
  }
}

function normalizeBadgeCounts(raw: AdminBadgeCounts & {
  PendingApplications?: number;
  PendingScheduleChanges?: number;
}): AdminBadgeCounts {
  return {
    pendingApplications: raw.pendingApplications ?? raw.PendingApplications ?? 0,
    pendingScheduleChanges: raw.pendingScheduleChanges ?? raw.PendingScheduleChanges ?? 0,
  };
}
