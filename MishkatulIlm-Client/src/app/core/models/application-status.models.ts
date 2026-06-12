export type StudentApplicationStatus =
  | 'pending_application'
  | 'under_review'
  | 'awaiting_reply'
  | 'matched'
  | 'active'
  | 'rejected'
  | 'inactive'
  | 'approved'
  | 'enrolled';

export type AdminApplicationStatus = 'pending' | 'awaiting_reply' | 'active' | 'inactive';

export type ScheduleProposalStatus = 'awaiting_student' | 'student_amended' | 'accepted' | 'superseded';

export interface PlannedLessonRow {
  startsAtUtc: string;
  endsAtUtc: string;
  durationMinutes: number;
}

export interface ScheduleProposalResponse {
  proposalId: string;
  status: ScheduleProposalStatus;
  plannedLessons: PlannedLessonRow[];
  studentAmendNote?: string | null;
  createdAtUtc: string;
}

export interface StudentApplicationSummary {
  country?: string;
  city?: string;
  currentLevel: string;
  lessonFrequency: string;
  subjectCodes: string[];
  preferredAvailability: string[];
}

export interface StudentApplicationResponse {
  status: StudentApplicationStatus;
  onboardingCompleted: boolean;
  rejectionMessage?: string | null;
  summary: StudentApplicationSummary | null;
  scheduleProposal?: ScheduleProposalResponse | null;
}

export type ApplicationStepState = 'complete' | 'current' | 'upcoming';

export interface ApplicationStep {
  id: string;
  title: string;
  description: string;
  state: ApplicationStepState;
}
