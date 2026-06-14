import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import type { PaymentStatement, StudentPaymentHistoryItem } from '../models/payment.models';
import type {
  LessonAttendanceStatus,
  StudentLessonRow,
  StudentPortalResponse,
} from '../models/student-portal.models';

@Injectable({ providedIn: 'root' })
export class StudentApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getPortal(year: number, monthIndex: number): Observable<StudentPortalResponse> {
    const params = new HttpParams()
      .set('year', String(year))
      .set('month', String(monthIndex + 1));
    return this.http.get<StudentPortalResponse>(`${this.apiBaseUrl}/api/student/portal`, { params });
  }

  updateLessonNote(slotId: string, note: string): Observable<StudentLessonRow> {
    return this.http.patch<StudentLessonRow>(
      `${this.apiBaseUrl}/api/student/lessons/${slotId}/note`,
      { note },
    );
  }

  updateAttendance(slotId: string, attendanceStatus: LessonAttendanceStatus): Observable<StudentLessonRow> {
    return this.http.patch<StudentLessonRow>(
      `${this.apiBaseUrl}/api/student/lessons/${slotId}/attendance`,
      { attendanceStatus },
    );
  }

  requestScheduleChange(note: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiBaseUrl}/api/student/schedule-change-request`,
      { note },
    );
  }

  deleteAccount(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/api/student/delete-account`, {
      confirmation: 'DELETE',
    });
  }

  createCheckoutSession(): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.apiBaseUrl}/api/student/checkout-session`, {});
  }

  getPaymentStatement(): Observable<PaymentStatement> {
    return this.http.get<PaymentStatement>(`${this.apiBaseUrl}/api/student/payment-statement`).pipe(
      map((raw) => normalizePaymentStatement(raw)),
    );
  }

  submitPayment(): Observable<{ message: string; submissionId: string; status: string }> {
    return this.http.post<{ message: string; submissionId: string; status: string }>(
      `${this.apiBaseUrl}/api/student/payment-submission`,
      {},
    );
  }

  getPaymentHistory(): Observable<StudentPaymentHistoryItem[]> {
    return this.http.get<unknown>(`${this.apiBaseUrl}/api/student/payment-history`).pipe(
      map((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        return list.map((row) => normalizePaymentHistoryItem(row));
      }),
    );
  }

  confirmPayment(sessionId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/api/student/confirm-payment`, {
      sessionId,
    });
  }

  cancelSubscription(): Observable<{ message: string; subscriptionCurrentPeriodEndUtc?: string | null }> {
    return this.http.post<{ message: string; subscriptionCurrentPeriodEndUtc?: string | null }>(
      `${this.apiBaseUrl}/api/student/cancel-subscription`,
      {},
    );
  }
}

function normalizePaymentStatement(raw: PaymentStatement): PaymentStatement {
  const r = raw as PaymentStatement & Record<string, unknown>;
  const lessonsRaw = (r.lessons ?? r['Lessons'] ?? []) as Array<PaymentStatement['lessons'][number] & Record<string, unknown>>;
  return {
    studentName: String(r.studentName ?? r['StudentName'] ?? ''),
    paymentReference: String(r.paymentReference ?? r['PaymentReference'] ?? ''),
    billingYear: Number(r.billingYear ?? r['BillingYear'] ?? 0),
    billingMonth: Number(r.billingMonth ?? r['BillingMonth'] ?? 0),
    billingPeriodLabel: String(r.billingPeriodLabel ?? r['BillingPeriodLabel'] ?? ''),
    paymentDueUtc: (r.paymentDueUtc ?? r['PaymentDueUtc'] ?? null) as string | null,
    showPaymentReminder: Boolean(r.showPaymentReminder ?? r['ShowPaymentReminder'] ?? false),
    daysUntilDue: (r.daysUntilDue ?? r['DaysUntilDue'] ?? null) as number | null,
    hourlyRate: Number(r.hourlyRate ?? r['HourlyRate'] ?? 5),
    currency: String(r.currency ?? r['Currency'] ?? 'USD'),
    totalAmount: Number(r.totalAmount ?? r['TotalAmount'] ?? 0),
    accountName: String(r.accountName ?? r['AccountName'] ?? ''),
    accountNumber: String(r.accountNumber ?? r['AccountNumber'] ?? ''),
    sortCode: String(r.sortCode ?? r['SortCode'] ?? ''),
    bankName: String(r.bankName ?? r['BankName'] ?? ''),
    paymentInstructions: String(r.paymentInstructions ?? r['PaymentInstructions'] ?? ''),
    currentSubmissionStatus: (r.currentSubmissionStatus ?? r['CurrentSubmissionStatus'] ?? null) as PaymentStatement['currentSubmissionStatus'],
    currentSubmissionId: (r.currentSubmissionId ?? r['CurrentSubmissionId'] ?? null) as string | null,
    currentSubmissionSubmittedAtUtc: (r.currentSubmissionSubmittedAtUtc ?? r['CurrentSubmissionSubmittedAtUtc'] ?? null) as string | null,
    lessons: lessonsRaw.map((line) => ({
      slotId: String(line.slotId ?? line['SlotId'] ?? ''),
      startsAtUtc: String(line.startsAtUtc ?? line['StartsAtUtc'] ?? ''),
      endsAtUtc: String(line.endsAtUtc ?? line['EndsAtUtc'] ?? ''),
      durationMinutes: Number(line.durationMinutes ?? line['DurationMinutes'] ?? 0),
      hourlyRate: Number(line.hourlyRate ?? line['HourlyRate'] ?? 5),
      amount: Number(line.amount ?? line['Amount'] ?? 0),
    })),
  };
}

function normalizePaymentHistoryItem(raw: unknown): StudentPaymentHistoryItem {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(r['id'] ?? r['Id'] ?? ''),
    billingYear: Number(r['billingYear'] ?? r['BillingYear'] ?? 0),
    billingMonth: Number(r['billingMonth'] ?? r['BillingMonth'] ?? 0),
    billingPeriodLabel: String(r['billingPeriodLabel'] ?? r['BillingPeriodLabel'] ?? ''),
    status: (r['status'] ?? r['Status'] ?? 'pending_verification') as StudentPaymentHistoryItem['status'],
    amount: Number(r['amount'] ?? r['Amount'] ?? 0),
    currency: String(r['currency'] ?? r['Currency'] ?? 'USD'),
    submittedAtUtc: String(r['submittedAtUtc'] ?? r['SubmittedAtUtc'] ?? ''),
    reviewedAtUtc: (r['reviewedAtUtc'] ?? r['ReviewedAtUtc'] ?? null) as string | null,
  };
}
