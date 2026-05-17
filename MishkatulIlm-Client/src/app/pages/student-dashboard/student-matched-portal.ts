import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { StudentApiService } from '../../core/services/student-api.service';
import { StudentPortalStore } from '../../core/services/student-portal-store.service';
import { formatSlotRange } from '../../core/utils/datetime-local';
import { formatSlotRangeInZone } from '../../core/utils/timezone.util';
import { formatHttpError } from '../../core/utils/http-error.util';
import { StudentLessonCalendar } from '../../shared/student-lesson-calendar/student-lesson-calendar';
import { StudentWeekSchedule } from '../../shared/student-week-schedule/student-week-schedule';
import { startOfWeekMonday } from '../../core/utils/week-schedule.util';
import type { StudentScheduleChangeUpdate } from '../../core/models/student-portal.models';

export type MatchedPortalTab = 'summary' | 'lessons' | 'payments' | 'account';

const DISMISSED_UPDATES_STORAGE_KEY = 'mishkatulilm:dismissed-portal-updates';

@Component({
  selector: 'app-student-matched-portal',
  standalone: true,
  imports: [FormsModule, StudentLessonCalendar, StudentWeekSchedule, DatePipe, CurrencyPipe],
  templateUrl: './student-matched-portal.html',
  styleUrl: './student-matched-portal.scss',
})
export class StudentMatchedPortal implements OnInit {
  protected readonly store = inject(StudentPortalStore);
  private readonly studentApi = inject(StudentApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly activeTab = signal<MatchedPortalTab>('summary');
  protected readonly paymentBusy = signal(false);
  protected readonly showScheduleChangeForm = signal(false);
  protected readonly scheduleChangeNote = signal('');
  protected readonly showDeleteConfirm = signal(false);
  protected readonly deleteConfirmText = signal('');
  protected readonly actionBusy = signal(false);
  protected readonly summaryWeekStart = signal(startOfWeekMonday(new Date()));
  protected readonly dismissedUpdateKeys = signal<ReadonlySet<string>>(readDismissedUpdateKeys());
  protected readonly pastLessons = computed(() => {
    const now = Date.now();
    return this.store
      .lessons()
      .filter((l) => new Date(l.endsAtUtc).getTime() <= now)
      .sort((a, b) => b.startsAtUtc.localeCompare(a.startsAtUtc));
  });

  protected readonly upcomingLessons = computed(() => {
    const now = Date.now();
    return this.store
      .lessons()
      .filter((l) => new Date(l.startsAtUtc).getTime() > now)
      .sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));
  });

  protected readonly nextLesson = computed(() => this.store.nextLesson());

  protected readonly nextPaymentDue = computed(
    () => this.store.portalData()?.portal?.payment?.nextPaymentDueUtc ?? null,
  );

  protected readonly payment = computed(() => this.store.portalData()?.portal?.payment ?? null);

  protected readonly requiresInitialPayment = computed(
    () => this.payment()?.requiresInitialPayment ?? false,
  );

  protected readonly paymentOverdue = computed(() => this.payment()?.paymentOverdue ?? false);

  protected readonly subscriptionPastDue = computed(() => this.payment()?.subscriptionPastDue ?? false);

  protected readonly canMakePayment = computed(() => this.payment()?.canMakePayment ?? false);

  protected readonly hasActiveSubscription = computed(
    () => this.payment()?.hasActiveSubscription ?? false,
  );

  protected readonly subscriptionCancelAtPeriodEnd = computed(
    () => this.payment()?.subscriptionCancelAtPeriodEnd ?? false,
  );

  protected readonly subscriptionPeriodEnd = computed(
    () => this.payment()?.subscriptionCurrentPeriodEndUtc ?? null,
  );

  protected readonly canCancelSubscription = computed(
    () => this.payment()?.canCancelSubscription ?? false,
  );

  protected readonly showSubscriptionManage = computed(
    () =>
      this.canCancelSubscription() ||
      (this.subscriptionCancelAtPeriodEnd() && this.subscriptionPeriodEnd() != null),
  );

  protected readonly showCancelSubscriptionConfirm = signal(false);

  protected readonly scheduleChangeUpdate = computed(() => {
    const update = this.store.portalData()?.portal?.scheduleChangeUpdate ?? null;
    if (!update) return null;
    if (this.dismissedUpdateKeys().has(updateDismissKey(update))) return null;
    return update;
  });

  protected readonly hasPendingScheduleChange = computed(
    () => this.store.portalData()?.portal?.hasPendingScheduleChangeRequest ?? false,
  );

  ngOnInit(): void {
    const paymentResult = this.route.snapshot.queryParamMap.get('payment');
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');

    if (paymentResult === 'success') {
      this.activeTab.set('payments');
      if (sessionId) {
        this.confirmCheckoutReturn(sessionId);
      } else {
        this.store.actionMessage.set('Thank you — your payment was successful.');
        this.store.reloadPortal();
      }
    } else if (paymentResult === 'cancelled') {
      this.store.actionError.set('Payment was cancelled. You can try again when ready.');
      this.activeTab.set('payments');
      this.store.reloadPortal();
    } else {
      this.store.reloadPortalForWeek(this.summaryWeekStart());
    }

    if (paymentResult || sessionId) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { payment: null, session_id: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  private confirmCheckoutReturn(sessionId: string): void {
    this.paymentBusy.set(true);
    this.store.actionError.set(null);
    this.studentApi
      .confirmPayment(sessionId)
      .pipe(finalize(() => this.paymentBusy.set(false)))
      .subscribe({
        next: (res) => {
          this.store.actionMessage.set(res.message);
          this.store.reloadPortal();
        },
        error: (err: unknown) => {
          this.store.actionError.set(
            formatHttpError(err, 'Payment succeeded but confirmation failed. Try refreshing.'),
          );
          this.store.reloadPortal();
        },
      });
  }

  protected setTab(tab: MatchedPortalTab): void {
    this.activeTab.set(tab);
    if (tab === 'summary') {
      this.store.reloadPortalForWeek(this.summaryWeekStart());
    } else if (tab === 'lessons' || tab === 'payments' || tab === 'account') {
      this.store.reloadPortal();
    }
  }

  protected onSummaryWeekChanged(weekStart: Date): void {
    this.summaryWeekStart.set(weekStart);
    this.store.reloadPortalForWeek(weekStart);
  }

  protected formatLesson(startsAtUtc: string, endsAtUtc: string): string {
    return formatSlotRange(startsAtUtc, endsAtUtc);
  }

  protected formatLessonInZone(startsAtUtc: string, endsAtUtc: string): string {
    return formatSlotRangeInZone(startsAtUtc, endsAtUtc, this.store.timeZoneId());
  }

  protected toggleAttendance(lesson: { slotId: string; attendanceStatus: string }): void {
    const next = lesson.attendanceStatus === 'not_attending' ? 'attending' : 'not_attending';
    this.store.updateAttendance(lesson.slotId, next);
  }

  protected attendanceLabel(lesson: { attendanceStatus: string }, past: boolean): string {
    if (lesson.attendanceStatus === 'not_attending') {
      return past ? 'Did not attend' : 'Cannot attend';
    }
    return past ? 'Attended' : 'Attending';
  }

  protected toggleAttendanceLabel(lesson: { slotId: string; attendanceStatus: string }): string {
    if (this.store.updatingSlotId() === lesson.slotId) return 'Saving…';
    return lesson.attendanceStatus === 'not_attending' ? 'Mark as attending' : 'Cannot attend';
  }

  protected dismissUpdate(update: StudentScheduleChangeUpdate): void {
    const next = new Set(this.dismissedUpdateKeys());
    next.add(updateDismissKey(update));
    this.dismissedUpdateKeys.set(next);
    persistDismissedUpdateKeys(next);
  }

  protected scheduleUpdateTitle(update: StudentScheduleChangeUpdate): string {
    switch (update.status) {
      case 'pending':
        return 'Schedule change pending';
      case 'resolved':
        return 'Schedule updated';
      case 'declined':
        return 'Schedule change declined';
      default:
        return 'Schedule change';
    }
  }

  protected scheduleUpdateLead(update: StudentScheduleChangeUpdate): string {
    switch (update.status) {
      case 'pending':
        return 'Your teacher is reviewing your request. You can keep using your portal as usual.';
      case 'resolved':
        return 'Your lessons have been rescheduled. Check the calendar for your new times.';
      case 'declined':
        return 'Your teacher could not apply this change. See their message below.';
      default:
        return '';
    }
  }

  protected submitScheduleChange(): void {
    const note = this.scheduleChangeNote().trim();
    if (note.length < 10) {
      this.store.actionError.set('Please describe the change you need (at least 10 characters).');
      return;
    }
    this.actionBusy.set(true);
    this.store.actionError.set(null);
    this.studentApi
      .requestScheduleChange(note)
      .pipe(finalize(() => this.actionBusy.set(false)))
      .subscribe({
        next: (res) => {
          this.store.actionMessage.set(res.message);
          this.showScheduleChangeForm.set(false);
          this.scheduleChangeNote.set('');
          this.store.reloadPortal();
        },
        error: (err: unknown) => {
          this.store.actionError.set(formatHttpError(err, 'Could not send schedule change request.'));
        },
      });
  }

  protected makePayment(): void {
    if (this.paymentBusy() || !this.canMakePayment()) return;

    this.paymentBusy.set(true);
    this.store.actionError.set(null);
    this.studentApi
      .createCheckoutSession()
      .pipe(finalize(() => this.paymentBusy.set(false)))
      .subscribe({
        next: ({ url }) => {
          window.location.href = url;
        },
        error: (err: unknown) => {
          this.store.actionError.set(formatHttpError(err, 'Could not start payment.'));
        },
      });
  }

  protected cancelSubscription(): void {
    if (this.paymentBusy() || !this.canCancelSubscription()) return;

    this.paymentBusy.set(true);
    this.store.actionError.set(null);
    this.studentApi
      .cancelSubscription()
      .pipe(finalize(() => this.paymentBusy.set(false)))
      .subscribe({
        next: (res) => {
          this.store.actionMessage.set(res.message);
          this.showCancelSubscriptionConfirm.set(false);
          this.store.reloadPortal();
        },
        error: (err: unknown) => {
          this.store.actionError.set(formatHttpError(err, 'Could not cancel your subscription.'));
        },
      });
  }

  protected confirmDeleteAccount(): void {
    if (this.deleteConfirmText().trim() !== 'DELETE') {
      this.store.actionError.set('Type DELETE to confirm.');
      return;
    }
    this.actionBusy.set(true);
    this.store.actionError.set(null);
    this.studentApi
      .deleteAccount()
      .pipe(finalize(() => this.actionBusy.set(false)))
      .subscribe({
        next: (res) => {
          this.store.actionMessage.set(res.message);
          this.showDeleteConfirm.set(false);
          this.deleteConfirmText.set('');
          this.auth.logout();
          void this.router.navigate(['/']);
        },
        error: (err: unknown) => {
          this.store.actionError.set(formatHttpError(err, 'Could not process account deletion.'));
        },
      });
  }
}

function updateDismissKey(update: StudentScheduleChangeUpdate): string {
  return `schedule-change:${update.createdAtUtc}:${update.status}`;
}

function readDismissedUpdateKeys(): ReadonlySet<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_UPDATES_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((k): k is string => typeof k === 'string'));
  } catch {
    return new Set();
  }
}

function persistDismissedUpdateKeys(keys: ReadonlySet<string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DISMISSED_UPDATES_STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    // ignore quota / private mode
  }
}
