export type LessonAttendanceStatus = 'attending' | 'not_attending';

export interface StudentLessonRow {
  slotId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  durationMinutes: number;
  attendanceStatus: LessonAttendanceStatus;
  studentNote?: string | null;
}

export interface StudentPaymentSummary {
  nextPaymentDueUtc: string | null;
  lastPaymentAmount: number | null;
  lastPaymentCurrency: string;
  lastPaymentAtUtc: string | null;
  requiresInitialPayment: boolean;
  paymentOverdue: boolean;
  showPaymentReminder: boolean;
  daysUntilDue: number | null;
  currentSubmissionStatus: 'pending_verification' | 'paid' | 'rejected' | null;
  canSubmitPayment: boolean;
  currentPeriodPaid: boolean;
  showPaymentDetails: boolean;
  awaitingNextBlockPayment?: boolean;
}

export interface StudentLessonMonthSummary {
  pastLessonsCount: number;
  upcomingLessonsCount: number;
  attendingCount: number;
  notAttendingCount: number;
}

export type ScheduleChangeUpdateStatus = 'pending' | 'resolved' | 'declined';

export interface StudentScheduleChangeUpdate {
  status: ScheduleChangeUpdateStatus;
  requestNote: string;
  adminMessage?: string | null;
  createdAtUtc: string;
  resolvedAtUtc?: string | null;
}

export interface StudentPortalInfo {
  status: string;
  payment: StudentPaymentSummary;
  monthSummary: StudentLessonMonthSummary;
  nextLesson?: StudentLessonRow | null;
  hasPendingScheduleChangeRequest: boolean;
  scheduleChangeUpdate?: StudentScheduleChangeUpdate | null;
  deletionRequested: boolean;
  nextBlockBookingIssue?: string | null;
}

export interface StudentPortalResponse {
  portal: StudentPortalInfo;
  lessons: StudentLessonRow[];
  country?: string | null;
  city?: string | null;
}
