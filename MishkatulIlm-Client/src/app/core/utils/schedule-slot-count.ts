/** Slots the admin must pick in the start week (matches server LessonScheduleService). */
export function requiredWeekOneSlotCount(lessonFrequency: string): number {
  switch (lessonFrequency?.trim().toUpperCase()) {
    case 'TWICE-WEEK':
      return 2;
    case 'THREE-WEEK':
      return 3;
    case 'FOUR-PLUS-WEEK':
      return 4;
    default:
      return 1;
  }
}

export const BOOKING_WEEKS = 4;

export function calendarWeekStartUtc(isoUtc: string): number {
  const d = new Date(isoUtc);
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = day.getUTCDay();
  const offset = (dow - 1 + 7) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day.getTime();
}

export function selectionHint(required: number): string {
  if (required === 1) {
    return `Select 1 open slot in the start week. The same time repeats weekly for ${BOOKING_WEEKS} weeks (one month block).`;
  }
  return `Select ${required} open slots in the same start week. Each repeats weekly for ${BOOKING_WEEKS} weeks (one month block).`;
}

/** Human-readable booking span for the approve preview. */
export function bookingPeriodLabel(
  plannedLessons: ReadonlyArray<{ startsAtUtc: string }>,
): string {
  if (plannedLessons.length === 0) {
    return `the next ${BOOKING_WEEKS} weeks`;
  }
  const sorted = [...plannedLessons].sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));
  const first = new Date(sorted[0].startsAtUtc);
  const last = new Date(sorted[sorted.length - 1].startsAtUtc);
  const opts: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
  const startMonth = first.toLocaleString(undefined, opts);
  const endMonth = last.toLocaleString(undefined, opts);
  const months = startMonth === endMonth ? startMonth : `${startMonth} – ${endMonth}`;
  return `the next ${BOOKING_WEEKS} weeks (${months})`;
}
