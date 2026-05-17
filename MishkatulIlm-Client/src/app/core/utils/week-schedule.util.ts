/** Monday-based week start (local calendar date, midnight). */
export function startOfWeekMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addCalendarDays(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export function calendarDayKeyInZone(isoUtc: string, timeZoneId: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZoneId,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoUtc));
}

const WEEKDAY_TO_DOW: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function weekdayInZone(isoUtc: string, timeZoneId: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZoneId,
    weekday: 'short',
  }).format(new Date(isoUtc));
  return WEEKDAY_TO_DOW[weekday] ?? 0;
}

export function addDaysToDayKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map((part) => parseInt(part, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Monday (YYYY-MM-DD) for the week containing `isoUtc`, in the given IANA zone. */
export function calendarWeekStartKeyInZone(isoUtc: string, timeZoneId: string): string {
  const dayKey = calendarDayKeyInZone(isoUtc, timeZoneId);
  const dow = weekdayInZone(isoUtc, timeZoneId);
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDaysToDayKey(dayKey, offset);
}

export function calendarDayKeyFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Day key for a local calendar date interpreted in the student's time zone. */
export function dayKeyForLocalCalendarDate(date: Date, timeZoneId: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZoneId,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function weekDayDates(weekStartMonday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addCalendarDays(weekStartMonday, i));
}

export function monthsTouchingWeek(weekStartMonday: Date): Array<{ year: number; monthIndex: number }> {
  const seen = new Set<string>();
  const months: Array<{ year: number; monthIndex: number }> = [];
  for (let i = 0; i < 7; i++) {
    const d = addCalendarDays(weekStartMonday, i);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    months.push({ year: d.getFullYear(), monthIndex: d.getMonth() });
  }
  return months;
}

export function formatWeekRangeLabel(weekStartMonday: Date): string {
  const end = addCalendarDays(weekStartMonday, 6);
  const sameMonth = weekStartMonday.getMonth() === end.getMonth();
  const startFmt = weekStartMonday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const endFmt = end.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: sameMonth ? undefined : 'short',
    year: weekStartMonday.getFullYear() === end.getFullYear() ? undefined : 'numeric',
  });
  const year =
    weekStartMonday.getFullYear() === end.getFullYear()
      ? ` ${weekStartMonday.getFullYear()}`
      : '';
  return `${startFmt} – ${endFmt}${year}`;
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(date: Date): boolean {
  return isSameCalendarDay(date, new Date());
}

/** UTC range covering a Monday-start calendar week (exclusive end midnight). */
export function weekUtcRange(weekStartMonday: Date): { fromUtc: string; toUtc: string } {
  const from = new Date(
    Date.UTC(weekStartMonday.getFullYear(), weekStartMonday.getMonth(), weekStartMonday.getDate()),
  );
  const endDay = addCalendarDays(weekStartMonday, 7);
  const to = new Date(Date.UTC(endDay.getFullYear(), endDay.getMonth(), endDay.getDate()));
  return { fromUtc: from.toISOString(), toUtc: to.toISOString() };
}
