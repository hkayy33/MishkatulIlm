import type { AvailabilitySlotRow } from '../models/calendar.models';
import { parseLessonAttendanceStatus } from './attendance.util';

/** Matches LessonScheduleService day window (UTC). */
export const SCHEDULE_DAY_START_HOUR_UTC = 8;
export const SCHEDULE_DAY_END_HOUR_UTC = 22;
export const SCHEDULE_GRID_STEP_MINUTES = 30;
export const SCHEDULE_DURATION_OPTIONS = [30, 45, 60, 90, 120] as const;

export const FREE_TRIAL_DURATION_MINUTES = 30;
export const FREE_TRIAL_TITLE = 'Free trial';

export function utcCivilDayKey(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function utcCivilDayKeyFromCalendarDate(date: Date): string {
  return utcCivilDayKey(date.getFullYear(), date.getMonth(), date.getDate());
}

export function utcCivilDayKeyFromIso(isoUtc: string): string {
  const d = new Date(isoUtc);
  return utcCivilDayKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Calendar date (y-m-d) of an instant in a given IANA time zone. */
export function calendarDayKeyInZone(isoUtc: string, timeZoneId: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZoneId,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoUtc));
}

export function normalizeSlotStartIso(isoUtc: string): string {
  return new Date(isoUtc).toISOString();
}

export function addUtcMinutesIso(isoUtc: string, minutes: number): string {
  const d = new Date(isoUtc);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString();
}

export function enumerateUtcGridStartsForCivilDay(
  year: number,
  monthIndex: number,
  day: number,
): string[] {
  const starts: string[] = [];
  const fromMinutes = SCHEDULE_DAY_START_HOUR_UTC * 60;
  const toMinutes = SCHEDULE_DAY_END_HOUR_UTC * 60;
  for (let m = fromMinutes; m < toMinutes; m += SCHEDULE_GRID_STEP_MINUTES) {
    const dt = new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
    dt.setUTCMinutes(m);
    starts.push(dt.toISOString());
  }
  return starts;
}

export function defaultOpenAvailabilitySlot(startsAtUtc: string): AvailabilitySlotRow {
  return {
    startsAtUtc,
    endsAtUtc: addUtcMinutesIso(startsAtUtc, SCHEDULE_GRID_STEP_MINUTES),
    isAvailable: true,
    matchesStudentPreference: true,
    availableDurationMinutes: [...SCHEDULE_DURATION_OPTIONS],
  };
}

export function mergeDayAvailability(
  year: number,
  monthIndex: number,
  day: number,
  apiSlots: AvailabilitySlotRow[],
): AvailabilitySlotRow[] {
  const byStart = new Map<string, AvailabilitySlotRow>();
  for (const slot of apiSlots) {
    byStart.set(normalizeSlotStartIso(slot.startsAtUtc), slot);
  }

  return enumerateUtcGridStartsForCivilDay(year, monthIndex, day).map(
    (start) => byStart.get(start) ?? defaultOpenAvailabilitySlot(start),
  );
}

export function normalizeAvailabilityRows(
  rows: AvailabilitySlotRow[] | null | undefined,
): AvailabilitySlotRow[] {
  if (!rows?.length) return [];
  return rows.map((row) => {
    const raw = row as AvailabilitySlotRow & {
      StartsAtUtc?: string;
      EndsAtUtc?: string;
      IsAvailable?: boolean;
      MatchesStudentPreference?: boolean;
      AvailableDurationMinutes?: number[];
      SlotId?: string | null;
      StudentUserId?: string | null;
      StudentName?: string | null;
      AttendanceStatus?: string | null;
      StudentLessonNote?: string | null;
      IsAdminCalendarEntry?: boolean;
      Title?: string | null;
      Description?: string | null;
      IsPartiallyBlocked?: boolean;
      FreeSegmentStartsAtUtc?: string | null;
      PartialBlockEndsAtUtc?: string | null;
      EntryStartsAtUtc?: string | null;
      EntryEndsAtUtc?: string | null;
    };
    const startsAtUtc = normalizeSlotStartIso(String(row.startsAtUtc ?? raw.StartsAtUtc ?? ''));
    const endsRaw = row.endsAtUtc ?? raw.EndsAtUtc;
    const endsAtUtc = endsRaw
      ? normalizeSlotStartIso(String(endsRaw))
      : addUtcMinutesIso(startsAtUtc, SCHEDULE_GRID_STEP_MINUTES);
    const matchesStudentPreference =
      row.matchesStudentPreference ?? raw.MatchesStudentPreference ?? true;
    const isAvailable = Boolean(row.isAvailable ?? raw.IsAvailable ?? false);
    const availableDurationMinutes =
      row.availableDurationMinutes ?? raw.AvailableDurationMinutes ?? [];

    const studentUserId = row.studentUserId ?? raw.StudentUserId ?? null;
    const slotId = row.slotId ?? raw.SlotId ?? null;
    const attendanceRaw = row.attendanceStatus ?? raw.AttendanceStatus ?? null;
    const noteRaw = row.studentLessonNote ?? raw.StudentLessonNote ?? null;
    const studentLessonNote =
      typeof noteRaw === 'string' && noteRaw.trim().length > 0 ? noteRaw.trim() : null;
    const isAdminCalendarEntry = Boolean(
      row.isAdminCalendarEntry ?? raw.IsAdminCalendarEntry ?? false,
    );
    const titleRaw = row.title ?? raw.Title ?? null;
    const descriptionRaw = row.description ?? raw.Description ?? null;
    const title = typeof titleRaw === 'string' && titleRaw.trim().length > 0 ? titleRaw.trim() : null;
    const description =
      typeof descriptionRaw === 'string' && descriptionRaw.trim().length > 0
        ? descriptionRaw.trim()
        : null;
    const isPartiallyBlocked = Boolean(row.isPartiallyBlocked ?? raw.IsPartiallyBlocked ?? false);
    const freeRaw = row.freeSegmentStartsAtUtc ?? raw.FreeSegmentStartsAtUtc ?? null;
    const partialEndRaw = row.partialBlockEndsAtUtc ?? raw.PartialBlockEndsAtUtc ?? null;
    const entryStartRaw = row.entryStartsAtUtc ?? raw.EntryStartsAtUtc ?? null;
    const entryEndRaw = row.entryEndsAtUtc ?? raw.EntryEndsAtUtc ?? null;
    const freeSegmentStartsAtUtc = freeRaw ? normalizeSlotStartIso(String(freeRaw)) : null;
    const partialBlockEndsAtUtc = partialEndRaw ? normalizeSlotStartIso(String(partialEndRaw)) : null;
    const entryStartsAtUtc = entryStartRaw ? normalizeSlotStartIso(String(entryStartRaw)) : null;
    const entryEndsAtUtc = entryEndRaw ? normalizeSlotStartIso(String(entryEndRaw)) : null;

    return {
      ...row,
      startsAtUtc,
      endsAtUtc,
      isAvailable,
      matchesStudentPreference,
      availableDurationMinutes: isAvailable ? availableDurationMinutes : [],
      slotId: slotId ? String(slotId) : null,
      studentUserId: studentUserId ? String(studentUserId) : null,
      studentName: row.studentName ?? raw.StudentName ?? null,
      attendanceStatus: studentUserId ? parseLessonAttendanceStatus(attendanceRaw) : null,
      studentLessonNote: studentUserId ? studentLessonNote : null,
      isAdminCalendarEntry,
      title,
      description,
      isPartiallyBlocked,
      freeSegmentStartsAtUtc,
      partialBlockEndsAtUtc,
      entryStartsAtUtc,
      entryEndsAtUtc,
    };
  });
}

export function formatUtcTime(startsAtUtc: string): string {
  const d = new Date(startsAtUtc);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const mins = m === 0 ? '' : `:${String(m).padStart(2, '0')}`;
  return `${hour12}${mins}${period}`;
}

export function formatUtcSlotRange(startsAtUtc: string, endsAtUtc: string): string {
  return `${formatUtcTime(startsAtUtc)} – ${formatUtcTime(endsAtUtc)} UTC`;
}

export function durationLabel(minutes: number): string {
  if (minutes === 30) return '30 min';
  if (minutes === 45) return '45 min';
  if (minutes === 60) return '1 hour';
  if (minutes === 90) return '1 hr 30 min';
  if (minutes === 120) return '2 hours';
  return `${minutes} min`;
}

function collectBlockingIntervals(
  daySlots: AvailabilitySlotRow[],
): { startMs: number; endMs: number }[] {
  const intervals: { startMs: number; endMs: number }[] = [];
  const seenEntryKeys = new Set<string>();

  for (const slot of daySlots) {
    if (slot.isPartiallyBlocked && slot.partialBlockEndsAtUtc) {
      intervals.push({
        startMs: new Date(slot.startsAtUtc).getTime(),
        endMs: new Date(slot.partialBlockEndsAtUtc).getTime(),
      });
      continue;
    }

    if (slot.isAvailable) {
      continue;
    }

    if (slot.entryStartsAtUtc && slot.entryEndsAtUtc) {
      const key = slot.slotId ?? `${slot.entryStartsAtUtc}|${slot.entryEndsAtUtc}`;
      if (seenEntryKeys.has(key)) {
        continue;
      }
      seenEntryKeys.add(key);
      intervals.push({
        startMs: new Date(slot.entryStartsAtUtc).getTime(),
        endMs: new Date(slot.entryEndsAtUtc).getTime(),
      });
      continue;
    }

    intervals.push({
      startMs: new Date(slot.startsAtUtc).getTime(),
      endMs: new Date(slot.endsAtUtc).getTime(),
    });
  }

  return intervals;
}

function intervalsOverlap(startMs: number, endMs: number, blockStartMs: number, blockEndMs: number): boolean {
  return startMs < blockEndMs && endMs > blockStartMs;
}

/** Whether a duration fits without overlapping blocked intervals (supports mid-cell starts). */
export function canFitDurationOccupancy(
  startUtc: string,
  durationMinutes: number,
  daySlots: AvailabilitySlotRow[],
): boolean {
  const startMs = new Date(startUtc).getTime();
  const endMs = startMs + durationMinutes * 60 * 1000;
  const endHour = new Date(endMs).getUTCHours() + new Date(endMs).getUTCMinutes() / 60;
  if (endHour > SCHEDULE_DAY_END_HOUR_UTC) {
    return false;
  }

  for (const interval of collectBlockingIntervals(daySlots)) {
    if (intervalsOverlap(startMs, endMs, interval.startMs, interval.endMs)) {
      return false;
    }
  }

  return true;
}

export function durationsFromManageStart(
  startUtc: string,
  daySlots: AvailabilitySlotRow[],
): number[] {
  return SCHEDULE_DURATION_OPTIONS.filter((duration) =>
    canFitDurationOccupancy(startUtc, duration, daySlots),
  );
}

/** Durations that fit from this start using merged day slots (30-min steps). */
export function durationsFromStart(
  startUtc: string,
  daySlots: AvailabilitySlotRow[],
): number[] {
  const allowed = new Set<number>();
  for (const duration of SCHEDULE_DURATION_OPTIONS) {
    if (canFitDuration(startUtc, duration, daySlots)) {
      allowed.add(duration);
    }
  }
  return [...allowed];
}

export function canFitDuration(
  startUtc: string,
  durationMinutes: number,
  daySlots: AvailabilitySlotRow[],
): boolean {
  if (!canFitDurationOccupancy(startUtc, durationMinutes, daySlots)) {
    return false;
  }

  const normalizedStart = normalizeSlotStartIso(startUtc);
  const slot = daySlots.find((s) => normalizeSlotStartIso(s.startsAtUtc) === normalizedStart);
  if (slot?.isAvailable && !slot.isPartiallyBlocked) {
    const slotAllowed = slot.availableDurationMinutes ?? [];
    if (slotAllowed.length > 0 && !slotAllowed.includes(durationMinutes)) {
      return false;
    }
    return true;
  }

  const partialRow = daySlots.find(
    (s) =>
      s.isPartiallyBlocked &&
      s.freeSegmentStartsAtUtc &&
      normalizeSlotStartIso(s.freeSegmentStartsAtUtc) === normalizedStart,
  );
  if (partialRow) {
    const allowed = partialRow.availableDurationMinutes ?? [];
    if (allowed.length > 0 && !allowed.includes(durationMinutes)) {
      return false;
    }
  }

  return true;
}
