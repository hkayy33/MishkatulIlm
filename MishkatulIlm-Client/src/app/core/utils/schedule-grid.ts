import type { AvailabilitySlotRow } from '../models/calendar.models';

/** Matches LessonScheduleService day window (UTC). */
export const SCHEDULE_DAY_START_HOUR_UTC = 8;
export const SCHEDULE_DAY_END_HOUR_UTC = 22;
export const SCHEDULE_GRID_STEP_MINUTES = 30;
export const SCHEDULE_DURATION_OPTIONS = [30, 60, 90, 120] as const;

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
      StudentName?: string | null;
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

    return {
      ...row,
      startsAtUtc,
      endsAtUtc,
      isAvailable,
      matchesStudentPreference,
      availableDurationMinutes: isAvailable ? availableDurationMinutes : [],
      studentName: row.studentName ?? raw.StudentName ?? null,
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
  if (minutes === 60) return '1 hour';
  if (minutes === 90) return '1 hr 30 min';
  if (minutes === 120) return '2 hours';
  return `${minutes} min`;
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
  const steps = durationMinutes / SCHEDULE_GRID_STEP_MINUTES;
  const startMs = new Date(startUtc).getTime();
  for (let i = 0; i < steps; i++) {
    const stepStart = addUtcMinutesIso(startUtc, i * SCHEDULE_GRID_STEP_MINUTES);
    const slot = daySlots.find((s) => normalizeSlotStartIso(s.startsAtUtc) === stepStart);
    if (!slot?.isAvailable) {
      return false;
    }
    const slotAllowed = slot.availableDurationMinutes ?? [];
    if (slotAllowed.length > 0 && !slotAllowed.includes(durationMinutes)) {
      return false;
    }
  }
  const endMs = startMs + durationMinutes * 60 * 1000;
  const endHour = new Date(endMs).getUTCHours() + new Date(endMs).getUTCMinutes() / 60;
  return endHour <= SCHEDULE_DAY_END_HOUR_UTC;
}
