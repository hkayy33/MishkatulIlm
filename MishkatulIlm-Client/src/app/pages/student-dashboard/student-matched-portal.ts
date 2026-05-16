import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { StudentApiService } from '../../core/services/student-api.service';
import { StudentPortalStore } from '../../core/services/student-portal-store.service';
import { formatSlotRange } from '../../core/utils/datetime-local';
import { formatSlotRangeInZone } from '../../core/utils/timezone.util';
import { formatHttpError } from '../../core/utils/http-error.util';
import { StudentLessonCalendar } from '../../shared/student-lesson-calendar/student-lesson-calendar';

export type MatchedPortalTab = 'summary' | 'lessons' | 'payments' | 'account';

@Component({
  selector: 'app-student-matched-portal',
  standalone: true,
  imports: [FormsModule, StudentLessonCalendar, DatePipe, CurrencyPipe],
  templateUrl: './student-matched-portal.html',
  styleUrl: './student-matched-portal.scss',
})
export class StudentMatchedPortal implements OnInit {
  protected readonly store = inject(StudentPortalStore);
  private readonly studentApi = inject(StudentApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly activeTab = signal<MatchedPortalTab>('summary');
  protected readonly showScheduleChangeForm = signal(false);
  protected readonly scheduleChangeNote = signal('');
  protected readonly showDeleteConfirm = signal(false);
  protected readonly deleteConfirmText = signal('');
  protected readonly actionBusy = signal(false);

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

  ngOnInit(): void {
    this.store.reloadPortal();
  }

  protected setTab(tab: MatchedPortalTab): void {
    this.activeTab.set(tab);
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
          this.auth.logout();
          void this.router.navigate(['/']);
        },
        error: (err: unknown) => {
          this.store.actionError.set(formatHttpError(err, 'Could not process account deletion.'));
        },
      });
  }
}
