import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminApiService } from '../../../core/services/admin-api.service';
import { AdminScheduleRefreshService } from '../../../core/services/admin-schedule-refresh.service';
import type { AvailabilitySlotRow } from '../../../core/models/calendar.models';
import { SchedulingSettingsService } from '../../../core/services/scheduling-settings.service';
import { monthUtcRange } from '../../../core/utils/datetime-local';
import { AdminLessonCalendar } from '../../../shared/admin-lesson-calendar/admin-lesson-calendar';

@Component({
  selector: 'app-admin-calendar',
  standalone: true,
  imports: [AdminLessonCalendar],
  templateUrl: './admin-calendar.html',
  styleUrl: './admin-calendar.scss',
})
export class AdminCalendar {
  private readonly adminApi = inject(AdminApiService);
  private readonly schedulingSettings = inject(SchedulingSettingsService);
  private readonly scheduleRefresh = inject(AdminScheduleRefreshService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tutorSettings = computed(() => this.schedulingSettings.settings());

  protected readonly availability = signal<AvailabilitySlotRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly clearMessage = signal<string | null>(null);
  protected readonly clearing = signal(false);
  private viewMonth = new Date();

  constructor() {
    this.scheduleRefresh.scheduleChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reloadMonth(this.viewMonth));
    void this.schedulingSettings.ensureLoaded();
    this.reloadMonth(new Date());
  }

  protected onMonthChanged(month: Date): void {
    this.viewMonth = month;
    this.reloadMonth(month);
  }

  protected clearAllSlots(): void {
    if (!confirm('Delete all lesson slots? This cannot be undone.')) return;

    this.clearing.set(true);
    this.clearMessage.set(null);
    this.loadError.set(null);
    this.adminApi.clearAllLessonSlots().subscribe({
      next: (res) => {
        this.clearMessage.set(res.message);
        this.clearing.set(false);
        this.reloadMonth(this.viewMonth);
      },
      error: () => {
        this.loadError.set('Could not clear lesson slots.');
        this.clearing.set(false);
      },
    });
  }

  private reloadMonth(month: Date): void {
    this.loading.set(true);
    this.loadError.set(null);
    const range = monthUtcRange(month);
    const to = new Date(range.toUtc);
    to.setUTCDate(to.getUTCDate() + 35);
    this.adminApi.getAvailability(range.fromUtc, to.toISOString(), undefined, 0).subscribe({
        next: (list) => {
          this.availability.set(list ?? []);
          this.loading.set(false);
        },
        error: () => {
          this.loadError.set('Could not load calendar.');
          this.loading.set(false);
        },
      });
  }
}
