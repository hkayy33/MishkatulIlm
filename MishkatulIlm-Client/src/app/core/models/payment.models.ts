export type PaymentSubmissionStatus = 'pending_verification' | 'paid' | 'rejected';

export interface PaymentLessonLineItem {
  slotId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  durationMinutes: number;
  hourlyRate: number;
  amount: number;
}

export interface PaymentStatement {
  studentName: string;
  paymentReference: string;
  billingYear: number;
  billingMonth: number;
  billingPeriodLabel: string;
  paymentDueUtc: string | null;
  showPaymentReminder: boolean;
  daysUntilDue: number | null;
  hourlyRate: number;
  currency: string;
  totalAmount: number;
  lessons: PaymentLessonLineItem[];
  accountName: string;
  accountNumber: string;
  sortCode: string;
  bankName: string;
  paymentInstructions: string;
  currentSubmissionStatus: PaymentSubmissionStatus | null;
  currentSubmissionId: string | null;
  currentSubmissionSubmittedAtUtc: string | null;
}

export interface StudentPaymentHistoryItem {
  id: string;
  billingYear: number;
  billingMonth: number;
  billingPeriodLabel: string;
  status: PaymentSubmissionStatus;
  amount: number;
  currency: string;
  submittedAtUtc: string;
  reviewedAtUtc: string | null;
}

export interface AdminPaymentSubmissionRow {
  id: string;
  studentUserId: string;
  studentName: string;
  email: string;
  billingYear: number;
  billingMonth: number;
  billingPeriodLabel: string;
  status: PaymentSubmissionStatus;
  amount: number;
  currency: string;
  paymentReference: string;
  submittedAtUtc: string;
  reviewedAtUtc?: string | null;
  adminNote?: string | null;
  lessons: PaymentLessonLineItem[];
}
