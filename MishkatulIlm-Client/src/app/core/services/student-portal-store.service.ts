import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize } from 'rxjs';
import type {
  StudentLessonRow,
  StudentPortalResponse,
} from '../models/student-portal.models';
import { StudentApiService } from './student-api.service';
import { formatHttpError } from '../utils/http-error.util';
import { resolveTimeZoneId } from '../utils/timezone.util';

@Injectable({ providedIn: 'root' })
export class StudentPortalStore {
  private readonly studentApi = inject(StudentApiService);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly portalData = signal<StudentPortalResponse | null>(null);
  readonly updatingSlotId = signal<string | null>(null);
  readonly actionMessage = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  private viewMonth = new Date();

  readonly timeZoneId = computed(() => {
    const data = this.portalData();
    if (!data?.country) return 'UTC';
    return resolveTimeZoneId(data.country, data.city ?? '');
  });

  readonly lessons = computed(() => this.portalData()?.lessons ?? []);

  readonly nextLesson = computed(() => this.portalData()?.portal?.nextLesson ?? null);

  reloadPortal(month?: Date): void {
    if (month) this.viewMonth = month;

    this.loading.set(true);
    this.loadError.set(null);
    this.studentApi
      .getPortal(this.viewMonth.getFullYear(), this.viewMonth.getMonth())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (data) => this.portalData.set(normalizePortalResponse(data)),
        error: (err: unknown) => {
          this.loadError.set(formatHttpError(err, 'Could not load your lessons.'));
        },
      });
  }

  onMonthChanged(month: Date): void {
    this.reloadPortal(month);
  }

  updateAttendance(slotId: string, status: 'attending' | 'not_attending'): void {
    this.updatingSlotId.set(slotId);
    this.actionError.set(null);
    this.studentApi
      .updateAttendance(slotId, status)
      .pipe(finalize(() => this.updatingSlotId.set(null)))
      .subscribe({
        next: (updated) => {
          const data = this.portalData();
          if (!data) return;
          const lessons = data.lessons.map((l) => (l.slotId === updated.slotId ? updated : l));
          const nextLesson = (() => {
            const current = data.portal.nextLesson;
            if (current?.slotId === updated.slotId) return updated;
            if (current) return current;
            return earliestUpcomingLesson(lessons);
          })();
          const summary = {
            ...data.portal.monthSummary,
            attendingCount: lessons.filter((l) => l.attendanceStatus === 'attending').length,
            notAttendingCount: lessons.filter((l) => l.attendanceStatus === 'not_attending').length,
          };
          this.portalData.set({
            ...data,
            lessons,
            portal: { ...data.portal, monthSummary: summary, nextLesson },
          });
        },
        error: (err: unknown) => {
          this.actionError.set(formatHttpError(err, 'Could not update attendance.'));
        },
      });
  }
}

function normalizePortalResponse(raw: StudentPortalResponse): StudentPortalResponse {
  const r = raw as StudentPortalResponse & {
    Portal?: StudentPortalResponse['portal'];
    Lessons?: StudentLessonRow[];
    Country?: string;
    City?: string;
  };
  const portalRaw = raw.portal ?? r.Portal ?? ({} as StudentPortalResponse['portal'] & {
    NextLesson?: StudentLessonRow;
  });
  const lessons = (raw.lessons ?? r.Lessons ?? []).map((l) => {
    const row = l as StudentLessonRow & {
      SlotId?: string;
      StartsAtUtc?: string;
      EndsAtUtc?: string;
      AttendanceStatus?: string;
    };
    const status = String(l.attendanceStatus ?? row.AttendanceStatus ?? 'attending').toLowerCase();
    return {
      slotId: String(l.slotId ?? row.SlotId ?? ''),
      startsAtUtc: String(l.startsAtUtc ?? row.StartsAtUtc ?? ''),
      endsAtUtc: String(l.endsAtUtc ?? row.EndsAtUtc ?? ''),
      durationMinutes: l.durationMinutes ?? 60,
      attendanceStatus: status === 'not_attending' ? 'not_attending' : 'attending',
    } as StudentLessonRow;
  });

  const portal = {
    ...portalRaw,
    nextLesson: resolveNextLesson(raw, portalRaw, lessons),
  };

  return {
    portal,
    lessons,
    country: raw.country ?? r.Country ?? null,
    city: raw.city ?? r.City ?? null,
  };
}

function resolveNextLesson(
  raw: StudentPortalResponse,
  portalRaw: StudentPortalResponse['portal'] & { NextLesson?: StudentLessonRow },
  lessons: StudentLessonRow[],
): StudentLessonRow | null {
  const root = raw as StudentPortalResponse & {
    nextLesson?: StudentLessonRow;
    NextLesson?: StudentLessonRow;
  };
  const fromPortal = normalizeLessonRow(portalRaw.nextLesson ?? portalRaw.NextLesson);
  if (fromPortal) return fromPortal;

  const fromRoot = normalizeLessonRow(root.nextLesson ?? root.NextLesson);
  if (fromRoot) return fromRoot;

  return earliestUpcomingLesson(lessons);
}

function earliestUpcomingLesson(lessons: StudentLessonRow[]): StudentLessonRow | null {
  const now = Date.now();
  const upcoming = lessons
    .filter((l) => {
      const end = new Date(l.endsAtUtc).getTime();
      return Number.isFinite(end) && end > now;
    })
    .sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));
  return upcoming[0] ?? null;
}

function normalizeLessonRow(
  lesson: StudentLessonRow | null | undefined,
): StudentLessonRow | null {
  if (!lesson) return null;
  const row = lesson as StudentLessonRow & {
    SlotId?: string;
    StartsAtUtc?: string;
    EndsAtUtc?: string;
    AttendanceStatus?: string;
  };
  const startsAtUtc = String(lesson.startsAtUtc ?? row.StartsAtUtc ?? '').trim();
  const endsAtUtc = String(lesson.endsAtUtc ?? row.EndsAtUtc ?? '').trim();
  if (!startsAtUtc || !endsAtUtc) return null;

  const status = String(lesson.attendanceStatus ?? row.AttendanceStatus ?? 'attending').toLowerCase();
  return {
    slotId: String(lesson.slotId ?? row.SlotId ?? ''),
    startsAtUtc,
    endsAtUtc,
    durationMinutes: lesson.durationMinutes ?? 60,
    attendanceStatus: status === 'not_attending' ? 'not_attending' : 'attending',
  };
}
