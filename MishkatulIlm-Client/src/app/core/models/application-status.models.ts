export type StudentApplicationStatus =
  | 'pending_application'
  | 'under_review'
  | 'active'
  | 'inactive'
  | 'approved'
  | 'enrolled';

export type AdminApplicationStatus = 'pending' | 'active' | 'inactive';

export interface StudentApplicationSummary {
  currentLevel: string;
  lessonFrequency: string;
  subjectCodes: string[];
  preferredAvailability: string[];
}

export interface StudentApplicationResponse {
  status: StudentApplicationStatus;
  onboardingCompleted: boolean;
  summary: StudentApplicationSummary | null;
}

export type ApplicationStepState = 'complete' | 'current' | 'upcoming';

export interface ApplicationStep {
  id: string;
  title: string;
  description: string;
  state: ApplicationStepState;
}
