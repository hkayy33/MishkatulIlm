export interface AvailabilitySlotRow {
  startsAtUtc: string;
  endsAtUtc: string;
  durationMinutes?: number;
  availableDurationMinutes?: number[];
  isAvailable: boolean;
  matchesStudentPreference?: boolean;
  slotId?: string | null;
  studentUserId?: string | null;
  studentName?: string | null;
  studentCountry?: string | null;
  studentCity?: string | null;
  studentLessonNote?: string | null;
  attendanceStatus?: 'attending' | 'not_attending' | null;
  isAdminCalendarEntry?: boolean;
  title?: string | null;
  description?: string | null;
  isPartiallyBlocked?: boolean;
  freeSegmentStartsAtUtc?: string | null;
  partialBlockEndsAtUtc?: string | null;
  entryStartsAtUtc?: string | null;
  entryEndsAtUtc?: string | null;
}

export interface WeekOneLessonPick {
  startsAtUtc: string;
  durationMinutes: number;
}

export interface PlannedLessonRow {
  startsAtUtc: string;
  endsAtUtc: string;
  durationMinutes: number;
}

export interface BookingPreview {
  lessonCount: number;
  lessonFrequency: string;
  plannedStartsUtc: string[];
  plannedLessons: PlannedLessonRow[];
}

export interface LessonSlotRow {
  slotId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  isBooked: boolean;
  studentUserId?: string | null;
  studentName?: string | null;
  title?: string | null;
  description?: string | null;
}

export interface ScheduledLessonRow {
  slotId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  durationMinutes?: number;
}

export interface CreateLessonSlotBody {
  startsAtUtc: string;
  endsAtUtc: string;
  title: string;
  description?: string | null;
}

export interface UpdateLessonSlotBody {
  startsAtUtc?: string;
  endsAtUtc?: string;
  title?: string;
  description?: string | null;
}
