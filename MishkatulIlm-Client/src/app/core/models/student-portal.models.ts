export type LessonAttendanceStatus = 'attending' | 'not_attending';

export interface StudentLessonRow {
  slotId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  durationMinutes: number;
  attendanceStatus: LessonAttendanceStatus;
}

export interface StudentPaymentSummary {
  nextPaymentDueUtc: string | null;
  lastPaymentAmount: number | null;
  lastPaymentCurrency: string;
  lastPaymentAtUtc: string | null;
}

export interface StudentLessonMonthSummary {
  pastLessonsCount: number;
  upcomingLessonsCount: number;
  attendingCount: number;
  notAttendingCount: number;
}

export interface StudentPortalInfo {
  status: string;
  payment: StudentPaymentSummary;
  monthSummary: StudentLessonMonthSummary;
  nextLesson?: StudentLessonRow | null;
  hasPendingScheduleChangeRequest: boolean;
  deletionRequested: boolean;
}

export interface StudentPortalResponse {
  portal: StudentPortalInfo;
  lessons: StudentLessonRow[];
  country?: string | null;
  city?: string | null;
}
