export interface PlannedLessonLike {
  startsAtUtc: string;
  endsAtUtc: string;
}

interface LessonPattern {
  dayOrder: number;
  dayShort: string;
  startLabel: string;
  endLabel: string;
}

const DAY_ORDER: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Unique weekly slots from a full booking plan, e.g. "Wed 10:00–10:30". */
export function recurringLessonPatterns(
  lessons: ReadonlyArray<PlannedLessonLike>,
  timeZone?: string,
): string[] {
  const unique = new Map<string, LessonPattern>();

  for (const lesson of lessons) {
    const start = new Date(lesson.startsAtUtc);
    const end = new Date(lesson.endsAtUtc);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    const dayShort = weekdayShort(start, timeZone);
    const startLabel = formatClockTime(start, timeZone);
    const endLabel = formatClockTime(end, timeZone);
    const key = `${dayShort}|${startLabel}|${endLabel}`;

    if (!unique.has(key)) {
      unique.set(key, {
        dayOrder: DAY_ORDER[dayShort] ?? 7,
        dayShort,
        startLabel,
        endLabel,
      });
    }
  }

  return [...unique.values()]
    .sort((a, b) => a.dayOrder - b.dayOrder || a.startLabel.localeCompare(b.startLabel))
    .map((p) => `${p.dayShort} ${p.startLabel}–${p.endLabel}`);
}

function weekdayShort(date: Date, timeZone?: string): string {
  const part = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short' })
    .formatToParts(date)
    .find((p) => p.type === 'weekday');
  return part?.value ?? '—';
}

function formatClockTime(date: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour.padStart(2, '0')}:${minute}`;
}
