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
  WeekOneLessonPick,
} from '../models/calendar.models';
import type {
  SchedulingSettings,
  UpdateSchedulingSettingsBody,
} from '../models/scheduling-settings.models';
import type { AdminPaymentSubmissionRow } from '../models/payment.models';

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
  subjectCodes: string[];
  preferredAvailability: string[];
  scheduledLessons: ScheduledLessonRow[];
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

  listCalendarSlots(fromUtc: string, toUtc: string): Observable<LessonSlotRow[]> {
    return this.getAvailability(fromUtc, toUtc) as unknown as Observable<LessonSlotRow[]>;
  }

  createCalendarSlot(body: CreateLessonSlotBody): Observable<LessonSlotRow> {
    return this.http.post<LessonSlotRow>(this.base('/calendar/slots'), body);
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
        hourlyRate: Number(l.hourlyRate ?? l['HourlyRate'] ?? 5),
        amount: Number(l.amount ?? l['Amount'] ?? 0),
      };
    }),
  };
}
