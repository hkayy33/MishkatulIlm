import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  AdminApiService,
} from '../../../core/services/admin-api.service';
import type { AdminPaymentSubmissionRow } from '../../../core/models/payment.models';
import { AdminNavBadgeService } from '../../../core/services/admin-nav-badge.service';
import { formatHttpError } from '../../../core/utils/http-error.util';
import { formatSlotRange } from '../../../core/utils/datetime-local';

@Component({
  selector: 'app-admin-payments',
  standalone: true,
  imports: [DatePipe, CurrencyPipe, FormsModule],
  templateUrl: './admin-payments.html',
  styleUrl: './admin-payments.scss',
})
export class AdminPayments implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly navBadges = inject(AdminNavBadgeService);

  protected readonly rows = signal<AdminPaymentSubmissionRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionMessage = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly actionId = signal<string | null>(null);
  protected readonly statusFilter = signal<'all' | 'pending_verification' | 'paid' | 'rejected'>(
    'pending_verification',
  );
  protected readonly expandedId = signal<string | null>(null);

  protected readonly formatSlotRange = formatSlotRange;

  ngOnInit(): void {
    this.loadRows();
  }

  protected loadRows(): void {
    this.loading.set(true);
    this.loadError.set(null);
    const filter = this.statusFilter();
    const status = filter === 'all' ? undefined : filter;
    this.adminApi
      .listPaymentSubmissions(status)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (items) => this.rows.set(items),
        error: (err: unknown) => {
          this.loadError.set(formatHttpError(err, 'Could not load payment submissions.'));
        },
      });
  }

  protected setFilter(filter: 'all' | 'pending_verification' | 'paid' | 'rejected'): void {
    this.statusFilter.set(filter);
    this.loadRows();
  }

  protected toggleExpanded(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  protected approve(row: AdminPaymentSubmissionRow): void {
    if (this.actionId()) return;
    this.actionId.set(row.id);
    this.actionError.set(null);
    this.actionMessage.set(null);
    this.adminApi
      .approvePaymentSubmission(row.id)
      .pipe(finalize(() => this.actionId.set(null)))
      .subscribe({
        next: (res) => {
          this.actionMessage.set(res.message);
          this.navBadges.refresh();
          this.loadRows();
        },
        error: (err: unknown) => {
          this.actionError.set(formatHttpError(err, 'Could not approve payment.'));
        },
      });
  }

  protected reject(row: AdminPaymentSubmissionRow): void {
    if (this.actionId()) return;
    this.actionId.set(row.id);
    this.actionError.set(null);
    this.actionMessage.set(null);
    this.adminApi
      .rejectPaymentSubmission(row.id)
      .pipe(finalize(() => this.actionId.set(null)))
      .subscribe({
        next: (res) => {
          this.actionMessage.set(res.message);
          this.navBadges.refresh();
          this.loadRows();
        },
        error: (err: unknown) => {
          this.actionError.set(formatHttpError(err, 'Could not reject payment.'));
        },
      });
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'pending_verification':
        return 'Pending verification';
      case 'paid':
        return 'Paid';
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  }
}
