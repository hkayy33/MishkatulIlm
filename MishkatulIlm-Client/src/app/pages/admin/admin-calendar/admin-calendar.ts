import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AdminApiService } from '../../../core/services/admin-api.service';
import { AdminScheduleRefreshService } from '../../../core/services/admin-schedule-refresh.service';
import type { AvailabilitySlotRow } from '../../../core/models/calendar.models';
import { SchedulingSettingsService } from '../../../core/services/scheduling-settings.service';
import { addMinutesToIso, monthUtcRange } from '../../../core/utils/datetime-local';
import {
  durationLabel,
  durationsFromManageStart,
  mergeDayAvailability,
  normalizeAvailabilityRows,
  normalizeSlotStartIso,
  SCHEDULE_DURATION_OPTIONS,
} from '../../../core/utils/schedule-grid';
import { formatSlotRangeInZone } from '../../../core/utils/timezone.util';
import {
  AdminCalendarSlotCreate,
  AdminCalendarSlotPick,
  AdminLessonCalendar,
} from '../../../shared/admin-lesson-calendar/admin-lesson-calendar';

@Component({
  selector: 'app-admin-calendar',
  standalone: true,
  imports: [AdminLessonCalendar, FormsModule],
  templateUrl: './admin-calendar.html',
  styleUrl: './admin-calendar.scss',
})
export class AdminCalendar {
  private readonly adminApi = inject(AdminApiService);
  private readonly schedulingSettings = inject(SchedulingSettingsService);
  private readonly scheduleRefresh = inject(AdminScheduleRefreshService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tutorSettings = computed(() => this.schedulingSettings.settings());
  protected readonly durationOptions = SCHEDULE_DURATION_OPTIONS;
  protected readonly durationLabel = durationLabel;

  protected readonly availability = signal<AvailabilitySlotRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly slotSelectionError = signal<string | null>(null);
  protected readonly clearMessage = signal<string | null>(null);
  protected readonly clearing = signal(false);
  protected readonly saving = signal(false);

  protected readonly editSlot = signal<AdminCalendarSlotPick | null>(null);
  protected readonly editTitle = signal('');
  protected readonly editDescription = signal('');
  protected readonly editStartUtc = signal('');
  protected readonly editDurationMinutes = signal(30);

  private viewMonth = new Date();

  protected readonly editTimeLabel = computed(() => {
    const start = this.editStartUtc();
    if (!start) return '';
    const end = addMinutesToIso(start, this.editDurationMinutes());
    const tz = this.tutorSettings()?.tutorTimeZoneId ?? 'UTC';
    return formatSlotRangeInZone(start, end, tz);
  });

  protected readonly editDurationChoices = computed(() => {
    const start = this.editStartUtc();
    if (!start) return [];
    const daySlots = this.daySlotsForEdit();
    return durationsFromManageStart(start, daySlots);
  });

  protected readonly editStartOptions = computed(() => {
    const slot = this.editSlot();
    if (!slot) return [];
    const tz = this.tutorSettings()?.tutorTimeZoneId ?? 'UTC';
    const daySlots = this.daySlotsForEdit();
    const options = daySlots
      .filter((s) => s.isAvailable)
      .map((s) => ({
        value: normalizeSlotStartIso(s.startsAtUtc),
        label: formatSlotRangeInZone(
          s.startsAtUtc,
          addMinutesToIso(s.startsAtUtc, 30),
          tz,
        ),
      }));

    const current = normalizeSlotStartIso(slot.startsAtUtc);
    if (!options.some((o) => o.value === current)) {
      options.unshift({
        value: current,
        label: formatSlotRangeInZone(slot.startsAtUtc, slot.endsAtUtc, tz),
      });
    }

    const seen = new Set<string>();
    return options
      .filter((o) => {
        if (seen.has(o.value)) return false;
        seen.add(o.value);
        return true;
      })
      .sort((a, b) => a.value.localeCompare(b.value));
  });

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

  protected onCreateSlotRequested(request: AdminCalendarSlotCreate): void {
    this.actionError.set(null);
    this.slotSelectionError.set(null);
    this.saving.set(true);
    const endsAtUtc = addMinutesToIso(request.startsAtUtc, request.durationMinutes);
    this.adminApi
      .createCalendarSlot({
        startsAtUtc: request.startsAtUtc,
        endsAtUtc,
        title: request.title,
        description: request.description,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.scheduleRefresh.notifyScheduleChanged();
          this.reloadMonth(this.viewMonth);
        },
        error: (err) => {
          this.saving.set(false);
          this.actionError.set(readApiError(err, 'Could not add calendar entry.'));
        },
      });
  }

  protected onAdminSlotSelected(slot: AdminCalendarSlotPick): void {
    this.actionError.set(null);
    this.editSlot.set(slot);
    this.editTitle.set(slot.title ?? '');
    this.editDescription.set(slot.description ?? '');
    this.editStartUtc.set(normalizeSlotStartIso(slot.startsAtUtc));
    const duration = Math.round(
      (new Date(slot.endsAtUtc).getTime() - new Date(slot.startsAtUtc).getTime()) / 60000,
    );
    this.editDurationMinutes.set(duration > 0 ? duration : 30);
  }

  protected closeEditModal(): void {
    this.editSlot.set(null);
    this.actionError.set(null);
  }

  protected onEditStartChange(value: string): void {
    this.editStartUtc.set(value);
    const choices = this.editDurationChoices();
    if (choices.length > 0 && !choices.includes(this.editDurationMinutes())) {
      this.editDurationMinutes.set(choices[0] ?? 30);
    }
  }

  protected onEditDurationPick(minutes: number): void {
    if (!this.editDurationChoices().includes(minutes)) return;
    this.editDurationMinutes.set(minutes);
  }

  protected saveEditedSlot(): void {
    const slot = this.editSlot();
    const title = this.editTitle().trim();
    if (!slot) return;
    if (!title) {
      this.actionError.set('Title is required.');
      return;
    }
    if (!this.editDurationChoices().includes(this.editDurationMinutes())) {
      this.actionError.set('That duration is not available for the selected start time.');
      return;
    }

    this.actionError.set(null);
    this.saving.set(true);
    const startsAtUtc = this.editStartUtc();
    const endsAtUtc = addMinutesToIso(startsAtUtc, this.editDurationMinutes());

    this.adminApi
      .updateCalendarSlot(slot.slotId, {
        startsAtUtc,
        endsAtUtc,
        title,
        description: this.editDescription().trim() || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.closeEditModal();
          this.scheduleRefresh.notifyScheduleChanged();
          this.reloadMonth(this.viewMonth);
        },
        error: (err) => {
          this.saving.set(false);
          this.actionError.set(readApiError(err, 'Could not update calendar entry.'));
        },
      });
  }

  protected deleteEditedSlot(): void {
    const slot = this.editSlot();
    if (!slot) return;
    if (!confirm('Remove this calendar entry?')) return;

    this.actionError.set(null);
    this.saving.set(true);
    this.adminApi.deleteCalendarSlot(slot.slotId).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeEditModal();
        this.scheduleRefresh.notifyScheduleChanged();
        this.reloadMonth(this.viewMonth);
      },
      error: (err) => {
        this.saving.set(false);
        this.actionError.set(readApiError(err, 'Could not remove calendar entry.'));
      },
    });
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
        this.scheduleRefresh.notifyScheduleChanged();
        this.reloadMonth(this.viewMonth);
      },
      error: () => {
        this.loadError.set('Could not clear lesson slots.');
        this.clearing.set(false);
      },
    });
  }

  private daySlotsForEdit(): AvailabilitySlotRow[] {
    const slot = this.editSlot();
    if (!slot) return [];
    const day = new Date(slot.startsAtUtc);
    const apiDaySlots = normalizeAvailabilityRows(this.availability()).filter((row) => {
      const rowDay = new Date(row.startsAtUtc);
      return (
        rowDay.getUTCFullYear() === day.getUTCFullYear() &&
        rowDay.getUTCMonth() === day.getUTCMonth() &&
        rowDay.getUTCDate() === day.getUTCDate()
      );
    });
    const merged = mergeDayAvailability(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      apiDaySlots,
    );
    const slotStart = new Date(slot.startsAtUtc).getTime();
    const slotEnd = new Date(slot.endsAtUtc).getTime();

    return merged.map((row) => {
      const rowStart = new Date(row.startsAtUtc).getTime();
      const rowEnd = new Date(row.endsAtUtc).getTime();
      const overlapsEditSlot = rowStart < slotEnd && rowEnd > slotStart;
      if (overlapsEditSlot && row.slotId === slot.slotId && row.isAdminCalendarEntry) {
        return {
          ...row,
          isAvailable: true,
          availableDurationMinutes: [...SCHEDULE_DURATION_OPTIONS],
        };
      }
      return row;
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

function readApiError(err: unknown, fallback: string): string {
  const body = (err as { error?: { message?: string } })?.error;
  return typeof body?.message === 'string' && body.message.trim() ? body.message : fallback;
}
