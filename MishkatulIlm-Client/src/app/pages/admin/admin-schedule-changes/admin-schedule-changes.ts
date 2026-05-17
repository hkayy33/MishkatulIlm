import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AdminApiService,
  type AdminScheduleChangeRequestRow,
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
} from '../../../core/utils/schedule-slot-count';
import { AdminNavBadgeService } from '../../../core/services/admin-nav-badge.service';
import { AdminScheduleRefreshService } from '../../../core/services/admin-schedule-refresh.service';
import { SchedulingSettingsService } from '../../../core/services/scheduling-settings.service';
import { locationLabel, resolveTimeZoneId } from '../../../core/utils/timezone.util';
import { AdminLessonCalendar } from '../../../shared/admin-lesson-calendar/admin-lesson-calendar';

@Component({
  selector: 'app-admin-schedule-changes',
  standalone: true,
  imports: [DatePipe, FormsModule, AdminLessonCalendar],
  templateUrl: './admin-schedule-changes.html',
  styleUrl: './admin-schedule-changes.scss',
})
export class AdminScheduleChanges implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly schedulingSettings = inject(SchedulingSettingsService);
  private readonly navBadges = inject(AdminNavBadgeService);
  private readonly scheduleRefresh = inject(AdminScheduleRefreshService);

  protected readonly rows = signal<AdminScheduleChangeRequestRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionMessage = signal<string | null>(null);
  protected readonly actionUserId = signal<string | null>(null);

  protected readonly resolveTarget = signal<AdminScheduleChangeRequestRow | null>(null);
  protected readonly declineTarget = signal<AdminScheduleChangeRequestRow | null>(null);
  protected readonly declineMessage = signal('');

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
  protected readonly bookingPeriodLabel = bookingPeriodLabel;

  protected readonly requiredSlotCount = computed(() => {
    const freq = this.resolveTarget()?.lessonFrequency ?? '';
    return requiredWeekOneSlotCount(freq);
  });

  protected readonly tutorSettings = computed(() => this.schedulingSettings.settings());

  protected readonly scheduleStudentTimeZoneId = computed(() => {
    const row = this.resolveTarget();
    if (!row?.country || !row.city) return null;
    return resolveTimeZoneId(row.country, row.city);
  });

  protected readonly scheduleStudentLocationLabel = computed(() => {
    const row = this.resolveTarget();
    if (!row?.country) return null;
    return locationLabel(row.country, row.city ?? '');
  });

  protected readonly scheduleStudentDisplayName = computed(() => {
    const row = this.resolveTarget();
    return row ? row.studentName.trim() : null;
  });

  ngOnInit(): void {
    void this.schedulingSettings.ensureLoaded();
    this.reload();
  }

  formatSubjects(codes: string[]): string {
    return codes.map((c) => labelSubjectCode(c)).join(', ');
  }

  formatPreviewLesson(startsAtUtc: string, endsAtUtc: string): string {
    return formatSlotRange(startsAtUtc, endsAtUtc);
  }

  protected reload(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.adminApi.listPendingScheduleChangeRequests().subscribe({
      next: (list) => {
        this.rows.set(list.map(normalizeRow));
        this.loading.set(false);
        this.navBadges.refresh();
      },
      error: () => {
        this.loadError.set('Could not load schedule change requests.');
        this.loading.set(false);
      },
    });
  }

  protected openResolve(row: AdminScheduleChangeRequestRow): void {
    void this.schedulingSettings.ensureLoaded();
    this.resolveTarget.set(row);
    this.declineTarget.set(null);
    this.selectedWeekOneLessons.set([]);
    this.scheduleSelectionError.set(null);
    this.preview.set(null);
    this.loadError.set(null);
    this.scheduleViewMonth = new Date();
    this.loadAvailabilityForMonth(this.scheduleViewMonth);
  }

  protected openDecline(row: AdminScheduleChangeRequestRow): void {
    this.declineTarget.set(row);
    this.resolveTarget.set(null);
    this.declineMessage.set('');
    this.loadError.set(null);
  }

  protected closeModals(): void {
    this.resolveTarget.set(null);
    this.declineTarget.set(null);
    this.availability.set([]);
    this.selectedWeekOneLessons.set([]);
    this.preview.set(null);
    this.scheduleSelectionError.set(null);
    this.declineMessage.set('');
  }

  protected onScheduleMonthChanged(month: Date): void {
    this.scheduleViewMonth = month;
    this.loadAvailabilityForMonth(month);
  }

  protected onWeekOneLessonsChange(lessons: WeekOneLessonPick[]): void {
    this.selectedWeekOneLessons.set(lessons);
    this.preview.set(null);
    if (lessons.length > 0) {
      this.refreshPreview();
    }
  }

  protected onScheduleSelectionError(message: string | null): void {
    this.scheduleSelectionError.set(message);
  }

  protected confirmResolve(): void {
    const row = this.resolveTarget();
    const weekOne = this.selectedWeekOneLessons();
    if (!row) return;

    this.actionUserId.set(row.id);
    this.loadError.set(null);
    this.adminApi.resolveScheduleChangeRequest(row.id, weekOne).subscribe({
      next: (res) => {
        this.actionMessage.set(res.message);
        this.actionUserId.set(null);
        this.closeModals();
        this.rows.update((list) => list.filter((r) => r.id !== row.id));
        this.navBadges.refresh();
        this.scheduleRefresh.notifyScheduleChanged(row.studentUserId);
      },
      error: (err: { error?: { message?: string } }) => {
        this.loadError.set(err?.error?.message ?? 'Could not update the schedule.');
        this.actionUserId.set(null);
      },
    });
  }

  protected confirmDecline(): void {
    const row = this.declineTarget();
    if (!row) return;

    const message = this.declineMessage().trim();
    if (message.length < 10) {
      this.loadError.set('Please include a message for the student (at least 10 characters).');
      return;
    }

    this.actionUserId.set(row.id);
    this.loadError.set(null);
    this.adminApi.declineScheduleChangeRequest(row.id, message).subscribe({
      next: (res) => {
        this.actionMessage.set(res.message);
        this.actionUserId.set(null);
        this.closeModals();
        this.rows.update((list) => list.filter((r) => r.id !== row.id));
        this.navBadges.refresh();
      },
      error: (err: { error?: { message?: string } }) => {
        this.loadError.set(err?.error?.message ?? 'Could not decline the request.');
        this.actionUserId.set(null);
      },
    });
  }

  private loadAvailabilityForMonth(month: Date): void {
    const row = this.resolveTarget();
    if (!row) return;

    this.slotsLoading.set(true);
    const range = monthUtcRange(month);
    const to = new Date(range.toUtc);
    to.setUTCDate(to.getUTCDate() + 35);

    this.adminApi.getAvailability(range.fromUtc, to.toISOString(), row.studentUserId, 0).subscribe({
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
    const row = this.resolveTarget();
    const weekOne = this.selectedWeekOneLessons();
    if (!row || weekOne.length === 0) return;

    this.previewLoading.set(true);
    this.adminApi.previewBooking(row.studentUserId, weekOne).subscribe({
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
}

function normalizeRow(
  raw: AdminScheduleChangeRequestRow & {
    Id?: string;
    StudentUserId?: string;
    StudentName?: string;
    Email?: string;
    Note?: string;
    CreatedAtUtc?: string;
    SubjectCodes?: string[];
    PreferredAvailability?: string[];
  },
): AdminScheduleChangeRequestRow {
  return {
    id: String(raw.id ?? raw.Id ?? ''),
    studentUserId: String(raw.studentUserId ?? raw.StudentUserId ?? ''),
    studentName: raw.studentName ?? raw.StudentName ?? '',
    email: raw.email ?? raw.Email ?? '',
    note: raw.note ?? raw.Note ?? '',
    createdAtUtc: raw.createdAtUtc ?? raw.CreatedAtUtc ?? '',
    ageRange: raw.ageRange ?? null,
    gender: raw.gender ?? null,
    country: raw.country ?? null,
    city: raw.city ?? null,
    currentLevel: raw.currentLevel ?? null,
    lessonFrequency: raw.lessonFrequency ?? null,
    subjectCodes: raw.subjectCodes ?? raw.SubjectCodes ?? [],
    preferredAvailability: raw.preferredAvailability ?? raw.PreferredAvailability ?? [],
  };
}
