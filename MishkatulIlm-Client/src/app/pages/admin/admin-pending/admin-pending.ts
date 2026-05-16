import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import {
  AdminApiService,
  type AdminApplicationRow,
} from '../../../core/services/admin-api.service';
import type { AvailabilitySlotRow, BookingPreview, WeekOneLessonPick } from '../../../core/models/calendar.models';
import {
  formatAvailabilityCodes,
  labelAgeRangeCode,
  labelFrequencyCode,
  labelGenderCode,
  labelLevelCode,
  labelSubjectCode,
} from '../../../core/utils/onboarding-labels';
import { formatSlotRange, monthUtcRange } from '../../../core/utils/datetime-local';
import {
  BOOKING_WEEKS,
  bookingPeriodLabel,
  requiredWeekOneSlotCount,
  selectionHint,
} from '../../../core/utils/schedule-slot-count';
import { SchedulingSettingsService } from '../../../core/services/scheduling-settings.service';
import { locationLabel, resolveTimeZoneId } from '../../../core/utils/timezone.util';
import { AdminLessonCalendar } from '../../../shared/admin-lesson-calendar/admin-lesson-calendar';

@Component({
  selector: 'app-admin-pending',
  standalone: true,
  imports: [DatePipe, AdminLessonCalendar],
  templateUrl: './admin-pending.html',
  styleUrl: './admin-pending.scss',
})
export class AdminPending {
  private readonly adminApi = inject(AdminApiService);
  private readonly schedulingSettings = inject(SchedulingSettingsService);

  protected readonly rows = signal<AdminApplicationRow[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly actionUserId = signal<string | null>(null);

  protected readonly approveTarget = signal<AdminApplicationRow | null>(null);
  protected readonly availability = signal<AvailabilitySlotRow[]>([]);
  protected readonly slotsLoading = signal(false);
  protected readonly selectedWeekOneLessons = signal<WeekOneLessonPick[]>([]);
  protected readonly scheduleSelectionError = signal<string | null>(null);
  protected readonly preview = signal<BookingPreview | null>(null);
  protected readonly previewLoading = signal(false);

  private scheduleViewMonth = new Date();

  protected readonly bookingWeeks = BOOKING_WEEKS;

  protected readonly labelSubjectCode = labelSubjectCode;
  protected readonly labelLevelCode = labelLevelCode;
  protected readonly labelGenderCode = labelGenderCode;
  protected readonly labelAgeRangeCode = labelAgeRangeCode;
  protected readonly labelFrequencyCode = labelFrequencyCode;
  protected readonly formatAvailability = formatAvailabilityCodes;
  protected readonly formatSlotRange = formatSlotRange;
  protected readonly selectionHint = selectionHint;
  protected readonly bookingPeriodLabel = bookingPeriodLabel;

  protected readonly requiredSlotCount = computed(() => {
    const freq = this.approveTarget()?.lessonFrequency ?? '';
    return requiredWeekOneSlotCount(freq);
  });

  protected readonly canConfirmSchedule = computed(() => {
    return this.selectedWeekOneLessons().length === this.requiredSlotCount();
  });

  protected readonly tutorSettings = computed(() => this.schedulingSettings.settings());

  protected readonly scheduleStudentTimeZoneId = computed(() => {
    const row = this.approveTarget();
    if (!row?.country || !row.city) return null;
    return resolveTimeZoneId(row.country, row.city);
  });

  protected readonly scheduleStudentLocationLabel = computed(() => {
    const row = this.approveTarget();
    if (!row?.country) return null;
    return locationLabel(row.country, row.city ?? '');
  });

  protected readonly scheduleStudentDisplayName = computed(() => {
    const row = this.approveTarget();
    return row ? `${row.firstName} ${row.lastName}`.trim() : null;
  });

  constructor() {
    void this.schedulingSettings.ensureLoaded();
    this.reload();
  }

  formatSubjects(codes: string[]): string {
    return codes.map((c) => labelSubjectCode(c)).join(', ');
  }

  formatPreviewLesson(startsAtUtc: string, endsAtUtc: string): string {
    return formatSlotRange(startsAtUtc, endsAtUtc);
  }

  reload(): void {
    this.loading.set(true);
    this.loadError.set(null);
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

  openApprove(row: AdminApplicationRow): void {
    if (!row.onboardingCompleted) return;
    void this.schedulingSettings.ensureLoaded();
    this.approveTarget.set(row);
    this.selectedWeekOneLessons.set([]);
    this.scheduleSelectionError.set(null);
    this.preview.set(null);
    this.loadError.set(null);
    this.scheduleViewMonth = new Date();
    this.loadAvailabilityForMonth(this.scheduleViewMonth);
  }

  closeApprove(): void {
    this.approveTarget.set(null);
    this.availability.set([]);
    this.selectedWeekOneLessons.set([]);
    this.preview.set(null);
    this.scheduleSelectionError.set(null);
  }

  onScheduleMonthChanged(month: Date): void {
    this.scheduleViewMonth = month;
    this.loadAvailabilityForMonth(month);
  }

  onWeekOneLessonsChange(lessons: WeekOneLessonPick[]): void {
    this.selectedWeekOneLessons.set(lessons);
    this.preview.set(null);
    if (lessons.length === this.requiredSlotCount()) {
      this.refreshPreview();
    }
  }

  onScheduleSelectionError(message: string | null): void {
    this.scheduleSelectionError.set(message);
  }

  private loadAvailabilityForMonth(month: Date): void {
    const row = this.approveTarget();
    if (!row) return;

    this.slotsLoading.set(true);
    const range = monthUtcRange(month);
    const to = new Date(range.toUtc);
    to.setUTCDate(to.getUTCDate() + 35);

    this.adminApi.getAvailability(range.fromUtc, to.toISOString(), row.userId, 0).subscribe({
      next: (slots) => {
        this.availability.set(slots ?? []);
        this.slotsLoading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load lesson availability.');
        this.slotsLoading.set(false);
      },
    });
  }

  private refreshPreview(): void {
    const row = this.approveTarget();
    const weekOne = this.selectedWeekOneLessons();
    if (!row || weekOne.length !== this.requiredSlotCount()) return;

    this.previewLoading.set(true);
    this.adminApi.previewBooking(row.userId, weekOne).subscribe({
      next: (p) => {
        this.preview.set(p);
        this.previewLoading.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        this.previewLoading.set(false);
        this.preview.set(null);
        this.loadError.set(err?.error?.message ?? 'Could not preview schedule.');
      },
    });
  }

  confirmApprove(): void {
    const row = this.approveTarget();
    const weekOne = this.selectedWeekOneLessons();
    if (!row) return;

    if (weekOne.length !== this.requiredSlotCount()) {
      this.loadError.set(selectionHint(this.requiredSlotCount()));
      return;
    }

    this.actionUserId.set(row.userId);
    this.loadError.set(null);
    this.adminApi.approveApplication(row.userId, weekOne).subscribe({
      next: () => {
        this.rows.update((list) => list.filter((r) => r.userId !== row.userId));
        this.actionUserId.set(null);
        this.closeApprove();
      },
      error: (err: { error?: { message?: string } }) => {
        this.loadError.set(err?.error?.message ?? 'Could not approve application.');
        this.actionUserId.set(null);
      },
    });
  }

  markInactive(row: AdminApplicationRow): void {
    if (!row.onboardingCompleted) return;
    this.actionUserId.set(row.userId);
    this.adminApi.setApplicationStatus(row.userId, 'inactive').subscribe({
      next: () => this.rows.update((list) => list.filter((r) => r.userId !== row.userId)),
      error: () => this.loadError.set('Could not update status.'),
      complete: () => this.actionUserId.set(null),
    });
  }
}
