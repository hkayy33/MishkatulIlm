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

export type SubjectCode =
  | 'QURAN-MEMORISATION'
  | 'TAJWEED'
  | 'ARABIC-LANGUAGE'
  | 'QURAN-RECITATION-MASTERY'
  | 'ISLAMIC-STUDIES'
  | 'ISLAMIC-INHERITANCE';

/** Request body for saving student onboarding (updates users + student_onboarding_profiles). */
export interface SaveOnboardingRequest {
  firstName: string;
  lastName: string;
  ageRange: string;
  gender: string;
  currentLevel: string;
  lessonFrequency: string;
  subjectCodes: string[];
}
