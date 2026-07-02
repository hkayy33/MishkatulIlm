import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, EMPTY, finalize, switchMap, take } from 'rxjs';
import type {
  ApplicationStep,
  StudentApplicationResponse,
  StudentApplicationStatus,
} from '../../core/models/application-status.models';
import { OnboardingApiService } from '../../core/services/onboarding-api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatHttpError } from '../../core/utils/http-error.util';
import {
  formatAvailabilityCodes,
  labelFrequencyCode,
  labelLevelCode,
  labelPreferredLessonDurationCode,
  labelSubjectCode,
} from '../../core/utils/onboarding-labels';
import { recurringLessonPatterns } from '../../core/utils/recurring-lesson-label';
import { resolveTimeZoneId } from '../../core/utils/timezone.util';
import { StudentMatchedPortal } from './student-matched-portal';

interface StatusPresentation {
  label: string;
  detail: string;
  tone: 'pending' | 'review' | 'success' | 'neutral' | 'action' | 'rejected';
}

@Component({
  selector: 'app-student-dashboard',
  imports: [RouterLink, FormsModule, StudentMatchedPortal],
  templateUrl: './student-dashboard.html',
  styleUrl: './student-dashboard.scss',
})
export class StudentDashboard {
  protected readonly auth = inject(AuthService);
  private readonly onboardingApi = inject(OnboardingApiService);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly application = signal<StudentApplicationResponse | null>(null);
  protected readonly proposalAction = signal<'idle' | 'accept' | 'amend'>('idle');
  protected readonly showAmendForm = signal(false);
  protected readonly amendNote = signal('');
  protected readonly proposalError = signal<string | null>(null);

  protected readonly labelSubjectCode = labelSubjectCode;
  protected readonly labelLevelCode = labelLevelCode;
  protected readonly labelFrequencyCode = labelFrequencyCode;
  protected readonly labelPreferredLessonDurationCode = labelPreferredLessonDurationCode;
  protected readonly formatAvailabilityCodes = formatAvailabilityCodes;
  protected readonly isMatched = computed(() => {
    const status = this.application()?.status;
    return (
      status === 'matched' ||
      status === 'active' ||
      status === 'approved' ||
      status === 'enrolled'
    );
  });

  protected readonly statusPresentation = computed((): StatusPresentation => {
    const app = this.application();
    const status = app?.status ?? 'pending_application';
    return statusPresentationFor(status, app?.rejectionMessage ?? null);
  });

  protected readonly progressPercent = computed(() => {
    const status = this.application()?.status ?? 'pending_application';
    switch (status) {
      case 'pending_application':
        return 33;
      case 'under_review':
        return 66;
      case 'awaiting_reply':
        return 80;
      case 'matched':
      case 'active':
        return 100;
      case 'rejected':
      case 'inactive':
        return 100;
      case 'approved':
        return 85;
      case 'enrolled':
        return 100;
      default:
        return 25;
    }
  });

  protected readonly steps = computed((): ApplicationStep[] => {
    const status = this.application()?.status ?? 'pending_application';
    return buildApplicationSteps(status);
  });

  protected readonly scheduleProposal = computed(
    () => this.application()?.scheduleProposal ?? null,
  );

  protected readonly proposalScheduleSlots = computed(() => {
    const proposal = this.scheduleProposal();
    if (!proposal?.plannedLessons?.length) return [];

    const summary = this.application()?.summary;
    const timeZone = summary?.country
      ? resolveTimeZoneId(summary.country, summary.city ?? '')
      : undefined;

    return recurringLessonPatterns(proposal.plannedLessons, timeZone);
  });

  constructor() {
    afterNextRender(() => this.reloadApplication());
  }

  reloadApplication(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.auth
      .whenSessionReady$()
      .pipe(
        take(1),
        switchMap((ready) => {
          if (!ready) {
            this.loadError.set('Please sign in to view your application status.');
            this.loading.set(false);
            void this.router.navigate(['/login']);
            return EMPTY;
          }
          return this.onboardingApi.getMyApplication().pipe(
            catchError((err: unknown) => {
              if (err instanceof HttpErrorResponse && err.status === 401) {
                this.loadError.set('Your session expired. Please sign in again.');
                void this.router.navigate(['/login']);
              } else if (err instanceof HttpErrorResponse && err.status === 404) {
                this.loadError.set(
                  'We could not find your application yet. If you just signed up, complete the application form first.',
                );
              } else {
                this.loadError.set('Could not load your application status. Please try again.');
              }
              this.loading.set(false);
              return EMPTY;
            }),
          );
        }),
      )
      .subscribe({
        next: (app) => {
          this.application.set(normalizeApplication(app));
          this.loading.set(false);
        },
      });
  }

  protected acceptProposal(): void {
    if (this.proposalAction() !== 'idle') return;
    this.proposalError.set(null);
    this.proposalAction.set('accept');
    this.onboardingApi
      .acceptScheduleProposal()
      .pipe(finalize(() => this.proposalAction.set('idle')))
      .subscribe({
        next: () => {
          this.showAmendForm.set(false);
          this.reloadApplication();
        },
        error: (err: unknown) => {
          this.proposalError.set(formatHttpError(err, 'Could not accept the schedule.'));
        },
      });
  }

  protected submitAmend(): void {
    const note = this.amendNote().trim();
    if (note.length < 10) {
      this.proposalError.set('Please describe which days and times work for you (at least 10 characters).');
      return;
    }
    if (this.proposalAction() !== 'idle') return;

    this.proposalError.set(null);
    this.proposalAction.set('amend');
    this.onboardingApi
      .amendScheduleProposal(note)
      .pipe(finalize(() => this.proposalAction.set('idle')))
      .subscribe({
        next: () => {
          this.showAmendForm.set(false);
          this.amendNote.set('');
          this.reloadApplication();
        },
        error: (err: unknown) => {
          this.proposalError.set(formatHttpError(err, 'Could not send your availability note.'));
        },
      });
  }

  protected toggleAmendForm(): void {
    this.showAmendForm.update((v) => !v);
    this.proposalError.set(null);
  }
}

function statusPresentationFor(
  status: StudentApplicationStatus,
  rejectionMessage: string | null,
): StatusPresentation {
  switch (status) {
    case 'pending_application':
      return {
        label: 'Application incomplete',
        detail: 'Finish your student profile so we can review your request.',
        tone: 'pending',
      };
    case 'under_review':
      return {
        label: 'Under review',
        detail: 'Your application is with our team. We will email you about next steps.',
        tone: 'review',
      };
    case 'awaiting_reply':
      return {
        label: 'Awaiting your reply',
        detail: 'Review the proposed lesson times below and accept or request changes.',
        tone: 'action',
      };
    case 'matched':
    case 'active':
      return {
        label: 'Matched with a teacher',
        detail: 'Your lesson schedule is confirmed. Use the calendar below to manage your lessons.',
        tone: 'success',
      };
    case 'inactive':
    case 'rejected':
      return {
        label: 'Application rejected',
        detail:
          rejectionMessage?.trim() ||
          'Your application was not accepted. Contact us if you have questions.',
        tone: 'rejected',
      };
    case 'approved':
      return {
        label: 'Approved',
        detail: 'You have been accepted. We are preparing your placement details.',
        tone: 'success',
      };
    case 'enrolled':
      return {
        label: 'Enrolled',
        detail: 'You are matched and ready for lessons.',
        tone: 'success',
      };
    default:
      return {
        label: 'Application status',
        detail: '',
        tone: 'neutral',
      };
  }
}

function normalizeApplication(app: StudentApplicationResponse): StudentApplicationResponse {
  const raw = app as StudentApplicationResponse & {
    ScheduleProposal?: StudentApplicationResponse['scheduleProposal'];
    RejectionMessage?: string | null;
  };
  const proposal = app.scheduleProposal ?? raw.ScheduleProposal ?? null;
  const rejectionMessage = app.rejectionMessage ?? raw.RejectionMessage ?? null;
  const status =
    app.status === 'inactive' ? ('rejected' as const) : app.status;

  if (!proposal) {
    return { ...app, status, rejectionMessage, scheduleProposal: null };
  }

  const lessons = (proposal.plannedLessons ?? []).map((l) => {
    const row = l as typeof l & { StartsAtUtc?: string; EndsAtUtc?: string; DurationMinutes?: number };
    return {
      startsAtUtc: l.startsAtUtc ?? row.StartsAtUtc ?? '',
      endsAtUtc: l.endsAtUtc ?? row.EndsAtUtc ?? '',
      durationMinutes: l.durationMinutes ?? row.DurationMinutes ?? 60,
    };
  });

  return {
    ...app,
    status,
    rejectionMessage,
    scheduleProposal: { ...proposal, plannedLessons: lessons },
  };
}

function buildApplicationSteps(status: StudentApplicationStatus): ApplicationStep[] {
  const rejected = status === 'rejected' || status === 'inactive';
  const applicationComplete =
    status !== 'pending_application' && !rejected;
  const reviewReached =
    status === 'under_review' ||
    status === 'awaiting_reply' ||
    status === 'matched' ||
    status === 'active' ||
    status === 'approved' ||
    status === 'enrolled' ||
    rejected;
  const matched =
    status === 'matched' || status === 'active' || status === 'approved' || status === 'enrolled';
  const enrolled = status === 'enrolled';

  return [
    {
      id: 'account',
      title: 'Account created',
      description: 'You signed in and your account is active.',
      state: 'complete',
    },
    {
      id: 'application',
      title: 'Application submitted',
      description: applicationComplete
        ? 'Your learning preferences are on file.'
        : 'Tell us about your level, subjects, and availability.',
      state: applicationComplete ? 'complete' : 'current',
    },
    {
      id: 'review',
      title: rejected ? 'Application reviewed' : 'Under review',
      description: rejected
        ? 'Our team has reviewed your application.'
        : reviewReached
          ? 'Our team is reviewing your application.'
          : 'We review applications after you submit the form.',
      state: rejected ? 'complete' : matched || enrolled ? 'complete' : reviewReached ? 'current' : 'upcoming',
    },
    {
      id: 'matched',
      title: 'Matched with a teacher',
      description: rejected
        ? 'Your application was not accepted at this time.'
        : matched
          ? 'You are matched and can manage your lessons below.'
          : 'We will match you when a suitable teacher is available.',
      state: rejected ? 'current' : enrolled || matched ? 'complete' : 'upcoming',
    },
  ];
}
