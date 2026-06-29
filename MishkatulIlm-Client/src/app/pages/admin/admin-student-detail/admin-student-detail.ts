import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  AdminApiService,
  type AdminStudentDetailRow,
  type AdminStudentLessonHistoryRow,
  type AdminStudentPaymentHistoryRow,
} from '../../../core/services/admin-api.service';
import { SchedulingSettingsService } from '../../../core/services/scheduling-settings.service';
import { formatBillableLessonDuration } from '../../../core/utils/lesson-pricing';
import {
  labelLevelCode,
  labelPreferredLessonDurationCode,
  labelSubjectCode,
} from '../../../core/utils/onboarding-labels';
import { recurringLessonPatterns } from '../../../core/utils/recurring-lesson-label';
import { formatSlotRangeInZone, locationLabel } from '../../../core/utils/timezone.util';

@Component({
  selector: 'app-admin-student-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, CurrencyPipe],
  templateUrl: './admin-student-detail.html',
  styleUrl: './admin-student-detail.scss',
})
export class AdminStudentDetail {
  private readonly adminApi = inject(AdminApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly schedulingSettings = inject(SchedulingSettingsService);

  protected readonly student = signal<AdminStudentDetailRow | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly labelLevelCode = labelLevelCode;
  protected readonly labelSubjectCode = labelSubjectCode;
  protected readonly labelPreferredLessonDurationCode = labelPreferredLessonDurationCode;

  protected readonly upcomingLessons = computed(() => {
    const detail = this.student();
    if (!detail) return [];
    const now = Date.now();
    return detail.lessonHistory
      .filter((l) => new Date(l.endsAtUtc).getTime() > now)
      .sort((a, b) => new Date(a.startsAtUtc).getTime() - new Date(b.startsAtUtc).getTime());
  });

  constructor() {
    void this.schedulingSettings.ensureLoaded();
    const userId = this.route.snapshot.paramMap.get('userId');
    if (!userId) {
      this.loadError.set('Missing student id.');
      this.loading.set(false);
      return;
    }

    this.adminApi.getStudent(userId).subscribe({
      next: (row) => {
        this.student.set(row);
        this.loading.set(false);
      },
      error: (err: { status?: number }) => {
        this.loadError.set(
          err?.status === 404 ? 'Student not found or no longer active.' : 'Could not load student.',
        );
        this.loading.set(false);
      },
    });
  }

  protected studentName(detail: AdminStudentDetailRow): string {
    return `${detail.firstName} ${detail.lastName}`.trim();
  }

  protected formatLocation(detail: AdminStudentDetailRow): string {
    const fromApi = detail.location?.trim();
    if (fromApi) return fromApi;
    const country = detail.country?.trim() ?? '';
    const city = detail.city?.trim() ?? '';
    if (!country && !city) return 'Not provided';
    return locationLabel(country, city);
  }

  protected formatSubjects(codes: string[]): string {
    if (codes.length === 0) return '—';
    return codes.map((c) => labelSubjectCode(c)).join(', ');
  }

  protected formatSchedule(detail: AdminStudentDetailRow): string[] {
    return recurringLessonPatterns(detail.scheduledLessons);
  }

  protected formatLesson(startsAtUtc: string, endsAtUtc: string): string {
    const tz = this.schedulingSettings.settings()?.tutorTimeZoneId ?? 'UTC';
    return formatSlotRangeInZone(startsAtUtc, endsAtUtc, tz);
  }

  protected formatDuration(minutes: number): string {
    return formatBillableLessonDuration(minutes);
  }

  protected attendanceLabel(lesson: AdminStudentLessonHistoryRow): string {
    if (lesson.attendanceStatus === 'not_attending') {
      return 'Cannot attend';
    }
    return 'Attending';
  }

  protected paymentStatusLabel(status: AdminStudentPaymentHistoryRow['status']): string {
    switch (status) {
      case 'pending_verification':
        return 'Pending verification';
      case 'paid':
        return 'Paid';
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  }

  protected billablePaymentLessons(item: AdminStudentPaymentHistoryRow) {
    const attendedSlotIds = new Set(
      (this.student()?.lessonHistory ?? [])
        .filter((l) => l.attendanceStatus !== 'not_attending')
        .map((l) => l.slotId),
    );

    return item.lessons.filter((lesson) => {
      if (!lesson.slotId) return true;
      return attendedSlotIds.has(lesson.slotId);
    });
  }
}
