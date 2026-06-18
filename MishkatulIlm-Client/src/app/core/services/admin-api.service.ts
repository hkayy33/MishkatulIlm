import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import type {
  AdminApplicationStatus,
  ScheduleProposalStatus,
} from '../models/application-status.models';
import type {
  AvailabilitySlotRow,
  BookingPreview,
  CreateLessonSlotBody,
  LessonSlotRow,
  ScheduledLessonRow,
  UpdateLessonSlotBody,
  WeekOneLessonPick,
} from '../models/calendar.models';
import type {
  SchedulingSettings,
  UpdateSchedulingSettingsBody,
} from '../models/scheduling-settings.models';
import type { AdminPaymentSubmissionRow, PaymentLessonLineItem } from '../models/payment.models';
import {
  normalizeScheduledLessonList,
  resolveNextScheduledLesson,
} from '../utils/scheduled-lesson.util';

export interface AdminUserRow {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  onboardingCompleted: boolean;
  createdAtUtc: string;
}

export interface AdminApplicationRow {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  onboardingCompleted: boolean;
  applicationStatus: AdminApplicationStatus;
  scheduleProposalStatus?: ScheduleProposalStatus | null;
  studentAmendNote?: string | null;
  createdAtUtc: string;
  ageRange?: string | null;
  gender?: string | null;
  country?: string | null;
  city?: string | null;
  currentLevel?: string | null;
  lessonFrequency?: string | null;
  preferredLessonDuration?: string | null;
  subjectCodes: string[];
  preferredAvailability: string[];
}

export interface AdminStudentRow {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  hasMadePayment: boolean;
  nextPaymentDueUtc?: string | null;
  nextLesson?: ScheduledLessonRow | null;
  phoneNumber?: string | null;
  location?: string | null;
  country?: string | null;
  city?: string | null;
  ageRange?: string | null;
  gender?: string | null;
  currentLevel?: string | null;
  lessonFrequency?: string | null;
  preferredLessonDuration?: string | null;
  subjectCodes: string[];
  preferredAvailability: string[];
  scheduledLessons: ScheduledLessonRow[];
}

export interface AdminStudentLessonHistoryRow {
  slotId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  durationMinutes: number;
  attendanceStatus: 'attending' | 'not_attending';
  studentNote?: string | null;
}

export interface AdminStudentPaymentHistoryRow {
  id: string;
  billingYear: number;
  billingMonth: number;
  billingPeriodLabel: string;
  status: 'pending_verification' | 'paid' | 'rejected';
  amount: number;
  currency: string;
  paymentReference: string;
  submittedAtUtc: string;
  reviewedAtUtc?: string | null;
  adminNote?: string | null;
  lessons: PaymentLessonLineItem[];
}

export interface AdminStudentDetailRow extends AdminStudentRow {
  createdAtUtc: string;
  lastPaymentAtUtc?: string | null;
  lastPaymentAmount?: number | null;
  lastPaymentCurrency?: string | null;
  lessonHistory: AdminStudentLessonHistoryRow[];
  paymentHistory: AdminStudentPaymentHistoryRow[];
}

export interface AdminBadgeCounts {
  pendingApplications: number;
  pendingScheduleChanges: number;
  pendingPaymentSubmissions: number;
}

export interface AdminScheduleChangeRequestRow {
  id: string;
  studentUserId: string;
  studentName: string;
  email: string;
  note: string;
  createdAtUtc: string;
  ageRange?: string | null;
  gender?: string | null;
  country?: string | null;
  city?: string | null;
  currentLevel?: string | null;
  lessonFrequency?: string | null;
  preferredLessonDuration?: string | null;
  subjectCodes: string[];
  preferredAvailability: string[];
}

export interface AdminCreateUserBody {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  isAdmin?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  private base(path: string): string {
    return `${this.apiBaseUrl}/api/admin${path}`;
  }

  listUsers(): Observable<AdminUserRow[]> {
    return this.http.get<AdminUserRow[]>(this.base('/users'));
  }

  listPendingApplications(): Observable<AdminApplicationRow[]> {
    return this.http.get<AdminApplicationRow[]>(this.base('/applications/pending'));
  }

  getBadgeCounts(): Observable<AdminBadgeCounts> {
    return this.http.get<AdminBadgeCounts>(this.base('/dashboard/badge-counts'));
  }

  listPendingScheduleChangeRequests(): Observable<AdminScheduleChangeRequestRow[]> {
    return this.http.get<AdminScheduleChangeRequestRow[]>(
      this.base('/schedule-change-requests/pending'),
    );
  }

  resolveScheduleChangeRequest(
    requestId: string,
    weekOneLessons: WeekOneLessonPick[],
  ): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      this.base(`/schedule-change-requests/${requestId}/resolve`),
      { weekOneLessons },
    );
  }

  declineScheduleChangeRequest(
    requestId: string,
    message: string,
  ): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      this.base(`/schedule-change-requests/${requestId}/decline`),
      { message },
    );
  }

  getAvailability(
    fromUtc: string,
    toUtc: string,
    forStudentUserId?: string,
    /** 0 = picker mode (per-slot durations). Use 30/60/120 to filter the grid. */
    durationMinutes = 0,
  ): Observable<AvailabilitySlotRow[]> {
    let params = new HttpParams()
      .set('fromUtc', fromUtc)
      .set('toUtc', toUtc)
      .set('durationMinutes', String(durationMinutes));
    if (forStudentUserId) params = params.set('forStudentUserId', forStudentUserId);
    return this.http.get<AvailabilitySlotRow[]>(this.base('/calendar/availability'), { params });
  }

  previewBooking(userId: string, weekOneLessons: WeekOneLessonPick[]): Observable<BookingPreview> {
    return this.http.post<BookingPreview>(this.base('/calendar/preview-booking'), {
      userId,
      weekOneLessons,
    });
  }

  approveApplication(userId: string, weekOneLessons: WeekOneLessonPick[]): Observable<void> {
    return this.http.post<void>(this.base(`/applications/${userId}/approve`), {
      weekOneLessons,
    });
  }

  clearAllLessonSlots(): Observable<{ message: string; removed: number }> {
    return this.http.delete<{ message: string; removed: number }>(this.base('/calendar/slots'));
  }

  declineApplication(userId: string, message: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(this.base(`/applications/${userId}/decline`), {
      message,
    });
  }

  setApplicationStatus(userId: string, status: AdminApplicationStatus): Observable<void> {
    return this.http.patch<void>(this.base(`/applications/${userId}/status`), { status });
  }

  listStudents(): Observable<AdminStudentRow[]> {
    return this.http.get<AdminStudentRow[]>(this.base('/students'));
  }

  getStudent(userId: string): Observable<AdminStudentDetailRow> {
    return this.http
      .get<AdminStudentDetailRow>(this.base(`/students/${userId}`))
      .pipe(map((raw) => normalizeAdminStudentDetail(raw)));
  }

  listCalendarSlots(fromUtc: string, toUtc: string): Observable<LessonSlotRow[]> {
    return this.getAvailability(fromUtc, toUtc) as unknown as Observable<LessonSlotRow[]>;
  }

  createCalendarSlot(body: CreateLessonSlotBody): Observable<LessonSlotRow> {
    return this.http.post<LessonSlotRow>(this.base('/calendar/slots'), body);
  }

  updateCalendarSlot(slotId: string, body: UpdateLessonSlotBody): Observable<LessonSlotRow> {
    return this.http.patch<LessonSlotRow>(this.base(`/calendar/slots/${slotId}`), body);
  }

  deleteCalendarSlot(slotId: string): Observable<void> {
    return this.http.delete<void>(this.base(`/calendar/slots/${slotId}`));
  }

  createUser(body: AdminCreateUserBody): Observable<{ userId: string }> {
    return this.http.post<{ userId: string }>(this.base('/users'), body);
  }

  getSchedulingSettings(): Observable<SchedulingSettings> {
    return this.http.get<SchedulingSettings>(this.base('/settings/scheduling'));
  }

  updateSchedulingSettings(body: UpdateSchedulingSettingsBody): Observable<SchedulingSettings> {
    return this.http.put<SchedulingSettings>(this.base('/settings/scheduling'), body);
  }

  listPaymentSubmissions(status?: string): Observable<AdminPaymentSubmissionRow[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http
      .get<AdminPaymentSubmissionRow[]>(this.base('/payment-submissions'), { params })
      .pipe(map((rows) => rows.map(normalizeAdminPaymentSubmission)));
  }

  approvePaymentSubmission(
    submissionId: string,
    adminNote?: string,
  ): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      this.base(`/payment-submissions/${submissionId}/approve`),
      { adminNote: adminNote ?? null },
    );
  }

  rejectPaymentSubmission(
    submissionId: string,
    adminNote?: string,
  ): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      this.base(`/payment-submissions/${submissionId}/reject`),
      { adminNote: adminNote ?? null },
    );
  }
}

function normalizeAdminPaymentSubmission(raw: AdminPaymentSubmissionRow): AdminPaymentSubmissionRow {
  const r = raw as AdminPaymentSubmissionRow & Record<string, unknown>;
  const lessonsRaw = (r.lessons ?? r['Lessons'] ?? []) as AdminPaymentSubmissionRow['lessons'];
  return {
    id: String(r.id ?? r['Id'] ?? ''),
    studentUserId: String(r.studentUserId ?? r['StudentUserId'] ?? ''),
    studentName: String(r.studentName ?? r['StudentName'] ?? ''),
    email: String(r.email ?? r['Email'] ?? ''),
    billingYear: Number(r.billingYear ?? r['BillingYear'] ?? 0),
    billingMonth: Number(r.billingMonth ?? r['BillingMonth'] ?? 0),
    billingPeriodLabel: String(r.billingPeriodLabel ?? r['BillingPeriodLabel'] ?? ''),
    status: (r.status ?? r['Status'] ?? 'pending_verification') as AdminPaymentSubmissionRow['status'],
    amount: Number(r.amount ?? r['Amount'] ?? 0),
    currency: String(r.currency ?? r['Currency'] ?? 'USD'),
    paymentReference: String(r.paymentReference ?? r['PaymentReference'] ?? ''),
    submittedAtUtc: String(r.submittedAtUtc ?? r['SubmittedAtUtc'] ?? ''),
    reviewedAtUtc: (r.reviewedAtUtc ?? r['ReviewedAtUtc'] ?? null) as string | null,
    adminNote: (r.adminNote ?? r['AdminNote'] ?? null) as string | null,
    lessons: lessonsRaw.map((line) => {
      const l = line as typeof line & Record<string, unknown>;
      return {
        slotId: String(l.slotId ?? l['SlotId'] ?? ''),
        startsAtUtc: String(l.startsAtUtc ?? l['StartsAtUtc'] ?? ''),
        endsAtUtc: String(l.endsAtUtc ?? l['EndsAtUtc'] ?? ''),
        durationMinutes: Number(l.durationMinutes ?? l['DurationMinutes'] ?? 0),
        lessonRate: Number(l.lessonRate ?? l['LessonRate'] ?? l.hourlyRate ?? l['HourlyRate'] ?? 0),
        hourlyRate: Number(l.hourlyRate ?? l['HourlyRate'] ?? l.lessonRate ?? l['LessonRate'] ?? 0),
        rateLabel: String(l.rateLabel ?? l['RateLabel'] ?? ''),
        amount: Number(l.amount ?? l['Amount'] ?? 0),
      };
    }),
  };
}

function normalizeAdminStudentDetail(raw: AdminStudentDetailRow): AdminStudentDetailRow {
  const r = raw as AdminStudentDetailRow & Record<string, unknown>;
  const scheduledLessons = normalizeScheduledLessonList(
    (raw.scheduledLessons ?? r['ScheduledLessons'] ?? []) as AdminStudentDetailRow['scheduledLessons'],
  );
  const lessonHistoryRaw = (raw.lessonHistory ?? r['LessonHistory'] ?? []) as AdminStudentLessonHistoryRow[];
  const paymentHistoryRaw = (raw.paymentHistory ?? r['PaymentHistory'] ?? []) as AdminStudentPaymentHistoryRow[];

  return {
    userId: String(raw.userId ?? r['UserId'] ?? ''),
    email: String(raw.email ?? r['Email'] ?? ''),
    firstName: String(raw.firstName ?? r['FirstName'] ?? ''),
    lastName: String(raw.lastName ?? r['LastName'] ?? ''),
    hasMadePayment: Boolean(raw.hasMadePayment ?? r['HasMadePayment'] ?? false),
    nextPaymentDueUtc: (raw.nextPaymentDueUtc ?? r['NextPaymentDueUtc'] ?? null) as string | null,
    nextLesson: resolveNextScheduledLesson(
      (raw.nextLesson ?? r['NextLesson'] ?? null) as AdminStudentDetailRow['nextLesson'],
      scheduledLessons,
    ),
    phoneNumber: (raw.phoneNumber ?? r['PhoneNumber'] ?? null) as string | null,
    location: (raw.location ?? r['Location'] ?? null) as string | null,
    country: (raw.country ?? r['Country'] ?? null) as string | null,
    city: (raw.city ?? r['City'] ?? null) as string | null,
    ageRange: (raw.ageRange ?? r['AgeRange'] ?? null) as string | null,
    gender: (raw.gender ?? r['Gender'] ?? null) as string | null,
    currentLevel: (raw.currentLevel ?? r['CurrentLevel'] ?? null) as string | null,
    lessonFrequency: (raw.lessonFrequency ?? r['LessonFrequency'] ?? null) as string | null,
    preferredLessonDuration: (raw.preferredLessonDuration ?? r['PreferredLessonDuration'] ?? null) as
      | string
      | null,
    subjectCodes: (raw.subjectCodes ?? r['SubjectCodes'] ?? []) as string[],
    preferredAvailability: (raw.preferredAvailability ?? r['PreferredAvailability'] ?? []) as string[],
    scheduledLessons,
    createdAtUtc: String(raw.createdAtUtc ?? r['CreatedAtUtc'] ?? ''),
    lastPaymentAtUtc: (raw.lastPaymentAtUtc ?? r['LastPaymentAtUtc'] ?? null) as string | null,
    lastPaymentAmount: (raw.lastPaymentAmount ?? r['LastPaymentAmount'] ?? null) as number | null,
    lastPaymentCurrency: (raw.lastPaymentCurrency ?? r['LastPaymentCurrency'] ?? null) as string | null,
    lessonHistory: lessonHistoryRaw.map((lesson) => {
      const l = lesson as AdminStudentLessonHistoryRow & Record<string, unknown>;
      return {
        slotId: String(l.slotId ?? l['SlotId'] ?? ''),
        startsAtUtc: String(l.startsAtUtc ?? l['StartsAtUtc'] ?? ''),
        endsAtUtc: String(l.endsAtUtc ?? l['EndsAtUtc'] ?? ''),
        durationMinutes: Number(l.durationMinutes ?? l['DurationMinutes'] ?? 0),
        attendanceStatus: (l.attendanceStatus ?? l['AttendanceStatus'] ?? 'attending') as
          | 'attending'
          | 'not_attending',
        studentNote: (l.studentNote ?? l['StudentNote'] ?? null) as string | null,
      };
    }),
    paymentHistory: paymentHistoryRaw.map((payment) => {
      const p = payment as AdminStudentPaymentHistoryRow & Record<string, unknown>;
      return {
        id: String(p.id ?? p['Id'] ?? ''),
        billingYear: Number(p.billingYear ?? p['BillingYear'] ?? 0),
        billingMonth: Number(p.billingMonth ?? p['BillingMonth'] ?? 0),
        billingPeriodLabel: String(p.billingPeriodLabel ?? p['BillingPeriodLabel'] ?? ''),
        status: (p.status ?? p['Status'] ?? 'pending_verification') as AdminStudentPaymentHistoryRow['status'],
        amount: Number(p.amount ?? p['Amount'] ?? 0),
        currency: String(p.currency ?? p['Currency'] ?? 'USD'),
        paymentReference: String(p.paymentReference ?? p['PaymentReference'] ?? ''),
        submittedAtUtc: String(p.submittedAtUtc ?? p['SubmittedAtUtc'] ?? ''),
        reviewedAtUtc: (p.reviewedAtUtc ?? p['ReviewedAtUtc'] ?? null) as string | null,
        adminNote: (p.adminNote ?? p['AdminNote'] ?? null) as string | null,
        lessons: normalizePaymentLessonLineItems(p.lessons ?? p['Lessons'] ?? []),
      };
    }),
  };
}

function normalizePaymentLessonLineItems(raw: unknown): PaymentLessonLineItem[] {
  const rows = (raw ?? []) as PaymentLessonLineItem[];
  return rows.map((line) => {
    const l = line as PaymentLessonLineItem & Record<string, unknown>;
    return {
      slotId: String(l.slotId ?? l['SlotId'] ?? ''),
      startsAtUtc: String(l.startsAtUtc ?? l['StartsAtUtc'] ?? ''),
      endsAtUtc: String(l.endsAtUtc ?? l['EndsAtUtc'] ?? ''),
      durationMinutes: Number(l.durationMinutes ?? l['DurationMinutes'] ?? 0),
      lessonRate: Number(l.lessonRate ?? l['LessonRate'] ?? l.hourlyRate ?? l['HourlyRate'] ?? 0),
      hourlyRate: Number(l.hourlyRate ?? l['HourlyRate'] ?? l.lessonRate ?? l['LessonRate'] ?? 0),
      rateLabel: String(l.rateLabel ?? l['RateLabel'] ?? ''),
      amount: Number(l.amount ?? l['Amount'] ?? 0),
    };
  });
}
