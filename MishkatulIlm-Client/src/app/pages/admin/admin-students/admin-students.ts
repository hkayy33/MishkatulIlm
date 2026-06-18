import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { labelLevelCode, labelSubjectCode } from '../../../core/utils/onboarding-labels';
import { recurringLessonPatterns } from '../../../core/utils/recurring-lesson-label';
import { AdminApiService, type AdminStudentRow } from '../../../core/services/admin-api.service';
import { SchedulingSettingsService } from '../../../core/services/scheduling-settings.service';
import { AdminScheduleRefreshService } from '../../../core/services/admin-schedule-refresh.service';
import {
  normalizeScheduledLessonList,
  resolveNextScheduledLesson,
} from '../../../core/utils/scheduled-lesson.util';
import { formatSlotRangeInZone, locationLabel } from '../../../core/utils/timezone.util';

export type StudentPaymentFilter = 'all' | 'unpaid';

@Component({
  selector: 'app-admin-students',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink],
  templateUrl: './admin-students.html',
  styleUrl: './admin-students.scss',
})
export class AdminStudents {
  private readonly adminApi = inject(AdminApiService);
  private readonly schedulingSettings = inject(SchedulingSettingsService);
  private readonly scheduleRefresh = inject(AdminScheduleRefreshService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly students = signal<AdminStudentRow[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly createError = signal<string | null>(null);
  protected readonly createOk = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly creating = signal(false);
  protected readonly expandedStudentIds = signal<ReadonlySet<string>>(new Set());

  protected readonly searchQuery = signal('');
  protected readonly paymentFilter = signal<StudentPaymentFilter>('all');

  protected readonly filteredStudents = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const unpaidOnly = this.paymentFilter() === 'unpaid';
    return this.students().filter((s) => {
      if (unpaidOnly && s.hasMadePayment) return false;
      if (!q) return true;
      const haystack = [s.firstName, s.lastName, s.email, s.phoneNumber ?? '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  });

  protected createEmail = '';
  protected createPassword = '';
  protected createFirst = '';
  protected createLast = '';
  protected createIsAdmin = false;

  protected readonly labelLevelCode = labelLevelCode;
  protected readonly labelSubjectCode = labelSubjectCode;

  constructor() {
    this.scheduleRefresh.scheduleChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reload());
    void this.schedulingSettings.ensureLoaded();
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.adminApi.listStudents().subscribe({
      next: (rows) => {
        this.students.set(rows.map(normalizeStudentRow));
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load active students.');
        this.loading.set(false);
      },
    });
  }

  formatSchedule(lessons: AdminStudentRow['scheduledLessons']): string[] {
    return recurringLessonPatterns(lessons);
  }

  formatSubjects(codes: string[]): string {
    if (codes.length === 0) return '—';
    return codes.map((c) => labelSubjectCode(c)).join(', ');
  }

  formatLevel(code: string | null | undefined): string {
    if (!code) return '—';
    return labelLevelCode(code);
  }

  formatLocation(student: AdminStudentRow): string {
    const fromApi = student.location?.trim();
    if (fromApi) return fromApi;

    const country = student.country?.trim() ?? '';
    const city = student.city?.trim() ?? '';
    if (!country && !city) return 'Not provided';
    return locationLabel(country, city);
  }

  formatNextLesson(student: AdminStudentRow): string {
    const lesson = resolveNextScheduledLesson(student.nextLesson, student.scheduledLessons);
    if (!lesson) return '—';
    const tz = this.schedulingSettings.settings()?.tutorTimeZoneId ?? 'UTC';
    return formatSlotRangeInZone(lesson.startsAtUtc, lesson.endsAtUtc, tz);
  }

  protected isExpanded(userId: string): boolean {
    return this.expandedStudentIds().has(userId);
  }

  protected toggleDetails(userId: string): void {
    const next = new Set(this.expandedStudentIds());
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    this.expandedStudentIds.set(next);
  }

  onCreateSubmit(event: Event): void {
    event.preventDefault();
    this.createError.set(null);
    this.createOk.set(null);

    const email = this.createEmail.trim();
    const password = this.createPassword;
    const firstName = this.createFirst.trim();
    const lastName = this.createLast.trim();

    if (!email || !password || !firstName || !lastName) {
      this.createError.set('Fill in every field.');
      return;
    }
    if (password.length < 8) {
      this.createError.set('Password must be at least 8 characters.');
      return;
    }

    this.creating.set(true);
    this.adminApi
      .createUser({
        email,
        password,
        firstName,
        lastName,
        isAdmin: this.createIsAdmin,
      })
      .subscribe({
        next: () => {
          this.createOk.set('Account created. They can sign in with that email and password.');
          this.createEmail = '';
          this.createPassword = '';
          this.createFirst = '';
          this.createLast = '';
          this.createIsAdmin = false;
          this.creating.set(false);
          this.reload();
        },
        error: (err: { error?: { message?: string }; status?: number; message?: string }) => {
          const msg =
            err?.error?.message ??
            (err?.status === 503
              ? 'Server is missing Supabase:ServiceRoleKey. Add it on the API to enable account creation.'
              : (err?.message ?? 'Could not create the account.'));
          this.createError.set(msg);
          this.creating.set(false);
        },
      });
  }
}

function pickNonEmptyString(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function buildLocationFromParts(
  country: string | null,
  city: string | null,
): string | null {
  if (!country && !city) return null;
  if (country && city) return `${city}, ${country}`;
  return city ?? country;
}

function normalizeStudentRow(raw: AdminStudentRow): AdminStudentRow {
  const r = raw as AdminStudentRow & {
    UserId?: string;
    Email?: string;
    FirstName?: string;
    LastName?: string;
    HasMadePayment?: boolean;
    NextPaymentDueUtc?: string | null;
    NextLesson?: AdminStudentRow['nextLesson'];
    PhoneNumber?: string | null;
    Location?: string | null;
    Country?: string | null;
    City?: string | null;
    AgeRange?: string | null;
    Gender?: string | null;
    CurrentLevel?: string | null;
    LessonFrequency?: string | null;
    PreferredLessonDuration?: string | null;
    SubjectCodes?: string[];
    PreferredAvailability?: string[];
    ScheduledLessons?: AdminStudentRow['scheduledLessons'];
  };
  const scheduledLessons = normalizeScheduledLessonList(
    raw.scheduledLessons ?? r.ScheduledLessons ?? [],
  );
  const nextLesson = resolveNextScheduledLesson(raw.nextLesson ?? r.NextLesson, scheduledLessons);
  const country = pickNonEmptyString(raw.country, r.Country);
  const city = pickNonEmptyString(raw.city, r.City);
  const location =
    pickNonEmptyString(raw.location, r.Location) ?? buildLocationFromParts(country, city);

  return {
    userId: String(raw.userId ?? r.UserId ?? ''),
    email: raw.email ?? r.Email ?? '',
    firstName: raw.firstName ?? r.FirstName ?? '',
    lastName: raw.lastName ?? r.LastName ?? '',
    hasMadePayment: raw.hasMadePayment ?? r.HasMadePayment ?? false,
    nextPaymentDueUtc: raw.nextPaymentDueUtc ?? r.NextPaymentDueUtc ?? null,
    nextLesson,
    phoneNumber: pickNonEmptyString(raw.phoneNumber, r.PhoneNumber),
    location,
    country,
    city,
    ageRange: raw.ageRange ?? r.AgeRange ?? null,
    gender: raw.gender ?? r.Gender ?? null,
    currentLevel: raw.currentLevel ?? r.CurrentLevel ?? null,
    lessonFrequency: raw.lessonFrequency ?? r.LessonFrequency ?? null,
    preferredLessonDuration: raw.preferredLessonDuration ?? r.PreferredLessonDuration ?? null,
    subjectCodes: raw.subjectCodes ?? r.SubjectCodes ?? [],
    preferredAvailability: raw.preferredAvailability ?? r.PreferredAvailability ?? [],
    scheduledLessons,
  };
}
