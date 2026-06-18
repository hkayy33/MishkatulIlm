export const LESSON_RATE_45_MIN_USD = 5;
export const LESSON_RATE_60_MIN_USD = 7;
export const WEEKS_PER_MONTH_BLOCK = 4;

export function monthlyPriceForLessonsPerWeek(
  lessonsPerWeek: number,
  durationMinutes: 45 | 60,
): number {
  const rate = durationMinutes === 45 ? LESSON_RATE_45_MIN_USD : LESSON_RATE_60_MIN_USD;
  return lessonsPerWeek * WEEKS_PER_MONTH_BLOCK * rate;
}

export function formatBillableLessonDuration(minutes: number): string {
  if (minutes === 45) return '45 min';
  if (minutes === 60) return '1 hour';
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} hr` : `${hours.toFixed(2)} hr`;
}

export function lessonRateLabel(minutes: number, rateLabel?: string | null): string {
  if (rateLabel?.trim()) return rateLabel;
  if (minutes === 45) return '45 min lesson';
  if (minutes === 60) return '1 hour lesson';
  return 'Lesson';
}
