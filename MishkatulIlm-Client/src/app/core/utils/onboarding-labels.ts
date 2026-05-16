import { LESSON_TIME_SLOTS, WEEKDAYS } from '../models/onboarding.models';

const SUBJECT_LABELS: Record<string, string> = {
  'QURAN-MEMORISATION': 'Quran memorisation',
  TAJWEED: 'Tajweed',
  'ARABIC-LANGUAGE': 'Arabic language',
  'QURAN-RECITATION-MASTERY': 'Quran recitation mastery',
  'ISLAMIC-STUDIES': 'Islamic studies course',
  'ISLAMIC-INHERITANCE': 'Islamic inheritance law',
};

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'Beginner',
  ELEMENTARY: 'Elementary',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
};

const GENDER_LABELS: Record<string, string> = {
  FEMALE: 'Female',
  MALE: 'Male',
  OTHER: 'Other',
  'PREFER-NOT': 'Prefer not to say',
};

const AGE_LABELS: Record<string, string> = {
  'UNDER-8': 'Under 8',
  '8-10': '8–10 years',
  '11-13': '11–13 years',
  '14-16': '14–16 years',
  '17-20': '17–20 years',
  '21-PLUS': '21 years and over',
};

const FREQUENCY_LABELS: Record<string, string> = {
  BIWEEKLY: 'Every two weeks',
  'ONCE-WEEK': 'Once per week',
  'TWICE-WEEK': 'Twice per week',
  'THREE-WEEK': 'Three times per week',
  'FOUR-PLUS-WEEK': 'Four or more times per week',
  FLEXIBLE: 'Flexible (to be agreed)',
};

export function labelSubjectCode(code: string): string {
  return SUBJECT_LABELS[code] ?? code.replace(/-/g, ' ').toLowerCase();
}

export function labelLevelCode(code: string): string {
  return LEVEL_LABELS[code] ?? code;
}

export function labelGenderCode(code: string): string {
  return GENDER_LABELS[code] ?? code;
}

export function labelAgeRangeCode(code: string): string {
  return AGE_LABELS[code] ?? code;
}

export function labelFrequencyCode(code: string): string {
  return FREQUENCY_LABELS[code] ?? code;
}

export function formatAvailabilityCodes(codes: string[]): string {
  if (!codes?.length) return '—';
  return codes
    .map((code) => {
      const dash = code.indexOf('-');
      if (dash < 0) return code;
      const day = code.slice(0, dash);
      const slot = code.slice(dash + 1);
      const dayLabel = WEEKDAYS.find((d) => d.code === day)?.label ?? day;
      const slotLabel = LESSON_TIME_SLOTS.find((s) => s.code === slot)?.label ?? slot;
      return `${dayLabel} ${slotLabel}`;
    })
    .join(', ');
}
