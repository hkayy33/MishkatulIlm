import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize, forkJoin } from 'rxjs';
import { monthsTouchingWeek, startOfWeekMonday } from '../utils/week-schedule.util';
import type {
  StudentLessonRow,
  StudentPortalResponse,
  StudentScheduleChangeUpdate,
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

  reloadPortalForWeek(weekAnchor: Date = new Date()): void {
    const weekStart = startOfWeekMonday(weekAnchor);
    const months = monthsTouchingWeek(weekStart);

    this.loading.set(true);
    this.loadError.set(null);

    forkJoin(months.map((m) => this.studentApi.getPortal(m.year, m.monthIndex)))
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (responses) => {
          if (responses.length === 0) return;
          const base = normalizePortalResponse(responses[0]);
          const lessonsById = new Map<string, StudentLessonRow>();
          for (const response of responses) {
            for (const lesson of normalizePortalResponse(response).lessons) {
              lessonsById.set(lesson.slotId, lesson);
            }
          }
          const lessons = [...lessonsById.values()].sort((a, b) =>
            a.startsAtUtc.localeCompare(b.startsAtUtc),
          );
          this.portalData.set({ ...base, lessons });
        },
        error: (err: unknown) => {
          this.loadError.set(formatHttpError(err, 'Could not load your lessons.'));
        },
      });
  }

  saveLessonNote(slotId: string, note: string, onComplete?: () => void): void {
    this.updatingSlotId.set(slotId);
    this.actionError.set(null);
    this.studentApi
      .updateLessonNote(slotId, note)
      .pipe(finalize(() => {
        this.updatingSlotId.set(null);
        onComplete?.();
      }))
      .subscribe({
        next: (updated) => {
          const data = this.portalData();
          if (!data) return;
          const normalized = normalizeLessonRow(updated);
          if (!normalized) return;
          const lessons = data.lessons.map((l) =>
            l.slotId === normalized.slotId ? normalized : l,
          );
          const nextLesson = (() => {
            const current = data.portal.nextLesson;
            if (current?.slotId === normalized.slotId) return normalized;
            if (current) return current;
            return earliestUpcomingLesson(lessons);
          })();
          this.portalData.set({
            ...data,
            lessons,
            portal: { ...data.portal, nextLesson },
          });
          this.actionMessage.set('Your note for this lesson was saved.');
        },
        error: (err: unknown) => {
          this.actionError.set(formatHttpError(err, 'Could not save your note.'));
        },
      });
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
          const normalized = normalizeLessonRow(updated);
          if (!normalized) return;
          const lessons = data.lessons.map((l) =>
            l.slotId === normalized.slotId ? normalized : l,
          );
          const nextLesson = (() => {
            const current = data.portal.nextLesson;
            if (current?.slotId === normalized.slotId) return normalized;
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
  const lessons = (raw.lessons ?? r.Lessons ?? [])
    .map((l) => normalizeLessonRow(l))
    .filter((l): l is StudentLessonRow => l !== null);

  const paymentRaw = portalRaw.payment ?? (portalRaw as { Payment?: StudentPortalResponse['portal']['payment'] }).Payment;
  const payment = paymentRaw
    ? {
        ...paymentRaw,
        requiresInitialPayment:
          paymentRaw.requiresInitialPayment ??
          (paymentRaw as { RequiresInitialPayment?: boolean }).RequiresInitialPayment ??
          paymentRaw.lastPaymentAtUtc == null,
      }
    : {
        nextPaymentDueUtc: null,
        lastPaymentAmount: null,
        lastPaymentCurrency: 'GBP',
        lastPaymentAtUtc: null,
        requiresInitialPayment: true,
      };

  const portal = {
    ...portalRaw,
    payment,
    nextLesson: resolveNextLesson(raw, portalRaw, lessons),
    hasPendingScheduleChangeRequest:
      portalRaw.hasPendingScheduleChangeRequest ??
      (portalRaw as { HasPendingScheduleChangeRequest?: boolean }).HasPendingScheduleChangeRequest ??
      false,
    scheduleChangeUpdate: normalizeScheduleChangeUpdate(
      portalRaw.scheduleChangeUpdate ??
        (portalRaw as { ScheduleChangeUpdate?: StudentScheduleChangeUpdate | null }).ScheduleChangeUpdate,
    ),
  };

  return {
    portal,
    lessons,
    country: raw.country ?? r.Country ?? null,
    city: raw.city ?? r.City ?? null,
  };
}

function normalizeScheduleChangeUpdate(
  raw: StudentScheduleChangeUpdate | null | undefined,
): StudentScheduleChangeUpdate | null {
  if (!raw) return null;
  const row = raw as StudentScheduleChangeUpdate & {
    Status?: string;
    RequestNote?: string;
    AdminMessage?: string | null;
    CreatedAtUtc?: string;
    ResolvedAtUtc?: string | null;
  };
  const statusRaw = String(raw.status ?? row.Status ?? 'pending').toLowerCase();
  const status =
    statusRaw === 'resolved' || statusRaw === 'declined' ? statusRaw : ('pending' as const);
  return {
    status,
    requestNote: raw.requestNote ?? row.RequestNote ?? '',
    adminMessage: raw.adminMessage ?? row.AdminMessage ?? null,
    createdAtUtc: raw.createdAtUtc ?? row.CreatedAtUtc ?? '',
    resolvedAtUtc: raw.resolvedAtUtc ?? row.ResolvedAtUtc ?? null,
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
    StudentNote?: string | null;
  };
  const startsAtUtc = String(lesson.startsAtUtc ?? row.StartsAtUtc ?? '').trim();
  const endsAtUtc = String(lesson.endsAtUtc ?? row.EndsAtUtc ?? '').trim();
  if (!startsAtUtc || !endsAtUtc) return null;

  const status = String(lesson.attendanceStatus ?? row.AttendanceStatus ?? 'attending').toLowerCase();
  const noteRaw = lesson.studentNote ?? row.StudentNote ?? null;
  const note = noteRaw?.trim() ? noteRaw.trim() : null;
  return {
    slotId: String(lesson.slotId ?? row.SlotId ?? ''),
    startsAtUtc,
    endsAtUtc,
    durationMinutes: lesson.durationMinutes ?? 60,
    attendanceStatus: status === 'not_attending' ? 'not_attending' : 'attending',
    studentNote: note,
  };
}
