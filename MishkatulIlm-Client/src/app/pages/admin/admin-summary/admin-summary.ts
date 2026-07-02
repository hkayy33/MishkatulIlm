import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AdminApiService } from '../../../core/services/admin-api.service';
import { AdminNavBadgeService } from '../../../core/services/admin-nav-badge.service';
import { AdminScheduleRefreshService } from '../../../core/services/admin-schedule-refresh.service';
import { AuthService } from '../../../core/services/auth.service';
import { SchedulingSettingsService } from '../../../core/services/scheduling-settings.service';
import type { AvailabilitySlotRow } from '../../../core/models/calendar.models';
import { parseLessonAttendanceStatus } from '../../../core/utils/attendance.util';
import { labelSubjectCode } from '../../../core/utils/onboarding-labels';
import { normalizeAvailabilityRows } from '../../../core/utils/schedule-grid';
import { startOfWeekMonday, weekUtcRange } from '../../../core/utils/week-schedule.util';
import {
  AdminWeekSchedule,
  type AdminWeekLesson,
} from '../../../shared/admin-week-schedule/admin-week-schedule';

@Component({
  selector: 'app-admin-summary',
  standalone: true,
  imports: [AdminWeekSchedule, RouterLink],
  templateUrl: './admin-summary.html',
  styleUrl: './admin-summary.scss',
})
export class AdminSummary {
  protected readonly auth = inject(AuthService);
  protected readonly navBadges = inject(AdminNavBadgeService);
  private readonly adminApi = inject(AdminApiService);
  private readonly schedulingSettings = inject(SchedulingSettingsService);
  private readonly scheduleRefresh = inject(AdminScheduleRefreshService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly weekLessons = signal<AdminWeekLesson[]>([]);
  protected readonly weekStart = signal(startOfWeekMonday(new Date()));

  protected readonly timeZoneId = computed(
    () => this.schedulingSettings.settings()?.tutorTimeZoneId ?? 'UTC',
  );

  protected readonly weekLessonTotal = computed(() => this.weekLessons().length);

  protected readonly totalPending = computed(() => {
    const counts = this.navBadges.counts();
    return (
      counts.pendingApplications +
      counts.pendingScheduleChanges +
      counts.pendingPaymentSubmissions
    );
  });

  constructor() {
    this.navBadges.refresh();
    this.scheduleRefresh.scheduleChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reloadWeek());
    void this.schedulingSettings.ensureLoaded().then(() => this.reloadWeek());
  }

  protected onWeekChanged(weekStart: Date): void {
    this.weekStart.set(weekStart);
    this.reloadWeek();
  }

  private reloadWeek(): void {
    this.loading.set(true);
    this.loadError.set(null);
    const { fromUtc, toUtc } = weekUtcRange(this.weekStart());

    forkJoin({
      slots: this.adminApi.getAvailability(fromUtc, toUtc, undefined, 0),
      students: this.adminApi.listStudents(),
    }).subscribe({
      next: ({ slots, students }) => {
        const subjectLabelsByUserId = buildSubjectLabelsByUserId(students);
        this.weekLessons.set(
          mapBookedLessons(normalizeAvailabilityRows(slots), subjectLabelsByUserId),
        );
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load lessons for this week.');
        this.loading.set(false);
      },
    });
  }
}

function buildSubjectLabelsByUserId(
  students: { userId: string; subjectCodes?: string[] }[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const student of students) {
    const row = student as {
      userId: string;
      UserId?: string;
      subjectCodes?: string[];
      SubjectCodes?: string[];
    };
    const userId = String(student.userId ?? row.UserId ?? '').trim();
    if (!userId) continue;
    const codes = student.subjectCodes ?? row.SubjectCodes ?? [];
    map.set(userId, codes.map((code) => labelSubjectCode(code)));
  }
  return map;
}

function mapBookedLessons(
  slots: AvailabilitySlotRow[],
  subjectLabelsByUserId: Map<string, string[]>,
): AdminWeekLesson[] {
  const bySlotId = new Map<string, AdminWeekLesson>();

  for (const s of slots) {
    const row = s as AvailabilitySlotRow & {
      SlotId?: string;
      StudentUserId?: string;
      AttendanceStatus?: string;
      StudentLessonNote?: string | null;
    };
    const slotId = String(s.slotId ?? row.SlotId ?? '').trim();
    const studentUserId = String(s.studentUserId ?? row.StudentUserId ?? '').trim();
    if (!slotId || !studentUserId) continue;

    const attendanceStatus = parseLessonAttendanceStatus(s.attendanceStatus ?? row.AttendanceStatus);
    const noteRaw = s.studentLessonNote ?? row.StudentLessonNote ?? null;
    const studentLessonNote =
      typeof noteRaw === 'string' && noteRaw.trim().length > 0 ? noteRaw.trim() : null;

    const lesson: AdminWeekLesson = {
      id: slotId,
      startsAtUtc: s.startsAtUtc,
      endsAtUtc: s.endsAtUtc,
      studentName: s.studentName?.trim() || 'Student',
      subjectLabels: subjectLabelsByUserId.get(studentUserId) ?? [],
      studentLessonNote,
      attendanceStatus,
    };

    const existing = bySlotId.get(slotId);
    if (!existing || attendanceStatus === 'not_attending') {
      bySlotId.set(slotId, lesson);
    }
  }

  return [...bySlotId.values()].sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));
}
