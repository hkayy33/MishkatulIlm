import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { catchError, EMPTY, switchMap, take } from 'rxjs';
import type {
  ApplicationStep,
  StudentApplicationResponse,
  StudentApplicationStatus,
} from '../../core/models/application-status.models';
import { OnboardingApiService } from '../../core/services/onboarding-api.service';
import { AuthService } from '../../core/services/auth.service';
import {
  formatAvailabilityCodes,
  labelFrequencyCode,
  labelLevelCode,
  labelSubjectCode,
} from '../../core/utils/onboarding-labels';

interface StatusPresentation {
  label: string;
  detail: string;
  tone: 'pending' | 'review' | 'success' | 'neutral';
}

@Component({
  selector: 'app-student-dashboard',
  imports: [RouterLink],
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

  protected readonly labelSubjectCode = labelSubjectCode;
  protected readonly labelLevelCode = labelLevelCode;
  protected readonly labelFrequencyCode = labelFrequencyCode;
  protected readonly formatAvailabilityCodes = formatAvailabilityCodes;

  protected readonly statusPresentation = computed((): StatusPresentation => {
    const status = this.application()?.status ?? 'pending_application';
    return statusPresentationFor(status);
  });

  protected readonly progressPercent = computed(() => {
    const status = this.application()?.status ?? 'pending_application';
    switch (status) {
      case 'pending_application':
        return 33;
      case 'under_review':
        return 66;
      case 'active':
        return 85;
      case 'inactive':
        return 50;
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
                  'Application status is not available yet. Restart the API server and try again.',
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
          this.application.set(app);
          this.loading.set(false);
        },
      });
  }
}

function statusPresentationFor(status: StudentApplicationStatus): StatusPresentation {
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
    case 'active':
      return {
        label: 'Active',
        detail: 'Your application is approved. We will contact you about lesson placement.',
        tone: 'success',
      };
    case 'inactive':
      return {
        label: 'Inactive',
        detail: 'Your application is on hold. Contact us if you have questions.',
        tone: 'neutral',
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

function buildApplicationSteps(status: StudentApplicationStatus): ApplicationStep[] {
  const applicationComplete =
    status !== 'pending_application' &&
    status !== 'inactive';
  const reviewReached =
    status === 'under_review' ||
    status === 'active' ||
    status === 'approved' ||
    status === 'enrolled';
  const approved =
    status === 'active' || status === 'approved' || status === 'enrolled';
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
      title: 'Under review',
      description: reviewReached
        ? 'Our team is reviewing your application.'
        : 'We review applications after you submit the form.',
      state: approved || enrolled ? 'complete' : reviewReached ? 'current' : 'upcoming',
    },
    {
      id: 'matched',
      title: 'Matched with a teacher',
      description: enrolled
        ? 'You are enrolled and ready for lessons.'
        : 'We will match you when a suitable teacher is available.',
      state: enrolled ? 'complete' : approved ? 'current' : 'upcoming',
    },
  ];
}
