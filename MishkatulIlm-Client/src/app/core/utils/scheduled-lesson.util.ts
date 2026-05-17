import type { ScheduledLessonRow } from '../models/calendar.models';

type LessonLike = {
  slotId?: string;
  startsAtUtc?: string;
  endsAtUtc?: string;
  SlotId?: string;
  StartsAtUtc?: string;
  EndsAtUtc?: string;
};

/** Normalize API lesson rows (camelCase or PascalCase). */
export function normalizeScheduledLessonRow(
  lesson: LessonLike | null | undefined,
): ScheduledLessonRow | null {
  if (!lesson) return null;
  const startsAtUtc = String(lesson.startsAtUtc ?? lesson.StartsAtUtc ?? '').trim();
  const endsAtUtc = String(lesson.endsAtUtc ?? lesson.EndsAtUtc ?? '').trim();
  if (!startsAtUtc || !endsAtUtc) return null;
  const startMs = new Date(startsAtUtc).getTime();
  const endMs = new Date(endsAtUtc).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;

  return {
    slotId: String(lesson.slotId ?? lesson.SlotId ?? ''),
    startsAtUtc,
    endsAtUtc,
  };
}

export function normalizeScheduledLessonList(
  lessons: ReadonlyArray<LessonLike> | null | undefined,
): ScheduledLessonRow[] {
  if (!lessons?.length) return [];
  return lessons.map((l) => normalizeScheduledLessonRow(l)).filter((l): l is ScheduledLessonRow => l !== null);
}

/** Earliest booked lesson that has not ended yet. */
export function earliestUpcomingScheduledLesson(
  lessons: ReadonlyArray<ScheduledLessonRow>,
): ScheduledLessonRow | null {
  const now = Date.now();
  const upcoming = lessons
    .filter((l) => {
      const end = new Date(l.endsAtUtc).getTime();
      return Number.isFinite(end) && end > now;
    })
    .sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));
  return upcoming[0] ?? null;
}

/** When the 4-week booking block has ended, infer the next weekly occurrence from existing slots. */
export function projectNextWeeklyOccurrence(
  lessons: ReadonlyArray<ScheduledLessonRow>,
): ScheduledLessonRow | null {
  if (lessons.length === 0) return null;

  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  let best: ScheduledLessonRow | null = null;

  for (const lesson of lessons) {
    const templateStart = new Date(lesson.startsAtUtc).getTime();
    const templateEnd = new Date(lesson.endsAtUtc).getTime();
    if (!Number.isFinite(templateStart) || !Number.isFinite(templateEnd)) continue;

    const durationMs = templateEnd - templateStart;
    let cursor = templateStart;
    if (cursor <= now) {
      const weeksToSkip = Math.floor((now - cursor) / weekMs) + 1;
      cursor += weeksToSkip * weekMs;
    }

    const candidate: ScheduledLessonRow = {
      slotId: lesson.slotId,
      startsAtUtc: new Date(cursor).toISOString(),
      endsAtUtc: new Date(cursor + durationMs).toISOString(),
    };

    if (!best || candidate.startsAtUtc < best.startsAtUtc) {
      best = candidate;
    }
  }

  return best;
}

export function resolveNextScheduledLesson(
  fromApi: LessonLike | null | undefined,
  scheduledLessons: ReadonlyArray<LessonLike> | null | undefined,
): ScheduledLessonRow | null {
  const normalized = normalizeScheduledLessonList(scheduledLessons);
  const apiLesson = normalizeScheduledLessonRow(fromApi);
  if (apiLesson) return apiLesson;

  const upcoming = earliestUpcomingScheduledLesson(normalized);
  if (upcoming) return upcoming;

  return projectNextWeeklyOccurrence(normalized);
}
