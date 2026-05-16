import type { WeekOneLessonPick } from '../models/calendar.models';
import { addMinutesToIso } from './datetime-local';

export const LESSON_DURATION_OPTIONS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1 hr 30 min' },
  { value: 120, label: '2 hours' },
] as const;

export type LessonDurationMinutes = (typeof LESSON_DURATION_OPTIONS)[number]['value'];

export const DEFAULT_LESSON_DURATION_MINUTES: LessonDurationMinutes = 60;

export function durationLabel(minutes: number): string {
  return LESSON_DURATION_OPTIONS.find((o) => o.value === minutes)?.label ?? `${minutes} min`;
}

export function lessonsOverlap(a: WeekOneLessonPick, b: WeekOneLessonPick): boolean {
  const endA = addMinutesToIso(a.startsAtUtc, a.durationMinutes);
  const endB = addMinutesToIso(b.startsAtUtc, b.durationMinutes);
  return a.startsAtUtc < endB && b.startsAtUtc < endA;
}

export function isDurationAllowedForSlot(
  slot: { startsAtUtc: string; availableDurationMinutes?: number[] },
  durationMinutes: number,
): boolean {
  const allowed = slot.availableDurationMinutes;
  if (!allowed?.length) return true;
  return allowed.includes(durationMinutes);
}
