/** Ordered from lowest to highest lesson cadence (excludes FLEXIBLE). */
export const LESSON_FREQUENCY_RANKED = [
  'BIWEEKLY',
  'ONCE-WEEK',
  'TWICE-WEEK',
  'THREE-WEEK',
  'FOUR-PLUS-WEEK',
] as const;

export type RankedLessonFrequency = (typeof LESSON_FREQUENCY_RANKED)[number];

const ALL_FREQUENCY_CODES = [...LESSON_FREQUENCY_RANKED, 'FLEXIBLE'] as const;

/** Allowed frequency codes for the given subject count (excludes empty placeholder). */
export function allowedLessonFrequencyCodes(subjectCount: number): string[] {
  if (subjectCount === 3) {
    return ['TWICE-WEEK', 'THREE-WEEK'];
  }
  return [...ALL_FREQUENCY_CODES];
}

export function isLessonFrequencyAllowed(frequency: string, subjectCount: number): boolean {
  const code = frequency.trim().toUpperCase();
  if (!code) return false;
  return allowedLessonFrequencyCodes(subjectCount).includes(code);
}

export function lessonFrequencyConstraintHint(subjectCount: number): string | null {
  if (subjectCount === 3) {
    return 'With 3 subjects selected, choose twice or three times per week.';
  }
  return null;
}
