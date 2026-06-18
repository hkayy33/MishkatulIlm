/**
 * Values align with onboarding form option `value`s and server validation.
 * POST /api/onboarding (JSON body, camelCase).
 */
export type AgeRangeCode =
  | ''
  | 'UNDER-8'
  | '8-10'
  | '11-13'
  | '14-16'
  | '17-20'
  | '21-PLUS';

export type GenderCode = '' | 'FEMALE' | 'MALE' | 'OTHER' | 'PREFER-NOT';

export type CurrentLevelCode = '' | 'BEGINNER' | 'ELEMENTARY' | 'INTERMEDIATE' | 'ADVANCED';

export type LessonFrequencyCode =
  | ''
  | 'BIWEEKLY'
  | 'ONCE-WEEK'
  | 'TWICE-WEEK'
  | 'THREE-WEEK'
  | 'FOUR-PLUS-WEEK'
  | 'FLEXIBLE';

export type PreferredLessonDurationCode = '' | 'MIN-45' | 'MIN-60';

export type SubjectCode =
  | 'QURAN-RECITATION'
  | 'QURAN-MEMORISATION'
  | 'ARABIC-LANGUAGE'
  | 'QURAN-RECITATION-MASTERY'
  | 'ISLAMIC-STUDIES'
  | 'ISLAMIC-INHERITANCE';

export type WeekdayCode = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export type LessonTimeSlotCode = 'MORNING' | 'AFTERNOON' | 'EVENING';

/** Composite code sent to the API, e.g. MON-MORNING */
export type PreferredAvailabilityCode = `${WeekdayCode}-${LessonTimeSlotCode}`;

export const WEEKDAYS: ReadonlyArray<{ code: WeekdayCode; label: string }> = [
  { code: 'MON', label: 'Mon' },
  { code: 'TUE', label: 'Tue' },
  { code: 'WED', label: 'Wed' },
  { code: 'THU', label: 'Thu' },
  { code: 'FRI', label: 'Fri' },
  { code: 'SAT', label: 'Sat' },
  { code: 'SUN', label: 'Sun' },
];

export const LESSON_TIME_SLOTS: ReadonlyArray<{
  code: LessonTimeSlotCode;
  label: string;
  hint: string;
}> = [
  { code: 'MORNING', label: 'Morning', hint: '8am – 12pm' },
  { code: 'AFTERNOON', label: 'Afternoon', hint: '12 – 5pm' },
  { code: 'EVENING', label: 'Evening', hint: '5 – 10pm' },
];

export function availabilitySlotKey(day: WeekdayCode, slot: LessonTimeSlotCode): PreferredAvailabilityCode {
  return `${day}-${slot}`;
}

/** Request body for saving student onboarding (updates users + student_onboarding_profiles). */
export interface SaveOnboardingRequest {
  firstName: string;
  lastName: string;
  ageRange: string;
  gender: string;
  country: string;
  city: string;
  phoneNumber: string;
  currentLevel: string;
  lessonFrequency: string;
  preferredLessonDuration: string;
  subjectCodes: string[];
  preferredAvailability: string[];
}
