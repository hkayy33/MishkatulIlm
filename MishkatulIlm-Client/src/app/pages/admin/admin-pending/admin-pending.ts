import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { AdminApiService, type AdminUserRow } from '../../../core/services/admin-api.service';

@Component({
  selector: 'app-admin-pending',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './admin-pending.html',
  styleUrl: './admin-pending.scss',
})
export class AdminPending {
  private readonly adminApi = inject(AdminApiService);

  protected readonly rows = signal<AdminUserRow[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly loading = signal(true);

  constructor() {
    this.adminApi.listPendingApplications().subscribe({
      next: (list) => {
        this.rows.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load pending applications.');
        this.loading.set(false);
      },
    });
  }
}
