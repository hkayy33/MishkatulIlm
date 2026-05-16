import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, finalize, firstValueFrom, of, switchMap, throwError } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import {
  availabilitySlotKey,
  LESSON_TIME_SLOTS,
  type LessonTimeSlotCode,
  type SaveOnboardingRequest,
  type WeekdayCode,
  WEEKDAYS,
} from '../../core/models/onboarding.models';
import { OnboardingApiService } from '../../core/services/onboarding-api.service';
import { LocationsApiService } from '../../core/services/locations-api.service';
import {
  SearchableSelect,
  type SearchableSelectOption,
} from '../../shared/searchable-select/searchable-select';
import {
  allowedLessonFrequencyCodes,
  isLessonFrequencyAllowed,
  lessonFrequencyConstraintHint,
} from '../../core/utils/lesson-frequency-rules';
import { Auth } from '../auth/auth';

interface SelectOption {
  value: string;
  label: string;
}

interface SubjectOption {
  value: string;
  label: string;
  selected: boolean;
}

@Component({
  selector: 'app-onboarding',
  imports: [Auth, FormsModule, SearchableSelect],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
})
export class Onboarding {
  protected readonly auth = inject(AuthService);
  private readonly onboardingApi = inject(OnboardingApiService);
  private readonly locationsApi = inject(LocationsApiService);
  private readonly router = inject(Router);

  submitError: string | null = null;
  submitting = signal(false);
  loadingCountries = signal(false);
  loadingCities = signal(false);
  locationLoadError: string | null = null;

  allCountries: SearchableSelectOption[] = [];
  allCities: SearchableSelectOption[] = [];
  selectedCountryId = '';
  selectedCityName = '';

  firstName = '';
  lastName = '';

  constructor() {
    // Login only reads `isAdmin` from the API. If /me failed earlier or the row was fixed in the DB
    // after sign-in, refresh here so admins are not stuck on onboarding.
    afterNextRender(() => {
      void firstValueFrom(
        this.auth.whenSessionReady$().pipe(
          switchMap((ready) => {
            if (!ready) return of(void 0);
            return this.auth.syncServerProfile().pipe(
              switchMap(() => this.auth.refreshServerProfile()),
            );
          }),
          catchError(() => of(void 0)),
        ),
      ).then(() => {
        if (!this.auth.isAuthenticated()) return;
        const u = this.auth.user();
        if (u?.firstName) this.firstName = u.firstName;
        if (u?.lastName) this.lastName = u.lastName;
        if (u?.isAdmin) void this.router.navigateByUrl('/admin', { replaceUrl: true });
        else if (u?.onboardingCompleted) void this.router.navigateByUrl('/dashboard', { replaceUrl: true });
        else this.loadCountries();
      });
    });
  }

  private loadCountries(): void {
    this.loadingCountries.set(true);
    this.locationLoadError = null;
    this.locationsApi
      .getCountries()
      .pipe(finalize(() => this.loadingCountries.set(false)))
      .subscribe({
        next: (items) => {
          this.allCountries = items.map((c) => ({ value: c.code, label: c.name }));
        },
        error: () => {
          this.locationLoadError = 'Could not load countries. Refresh the page to try again.';
        },
      });
  }

  onCountrySelected(countryId: string): void {
    this.selectedCountryId = countryId;
    this.selectedCityName = '';
    this.allCities = [];

    const id = Number(countryId);
    if (!id) return;

    this.loadingCities.set(true);
    this.locationLoadError = null;
    this.locationsApi
      .getCities(id)
      .pipe(finalize(() => this.loadingCities.set(false)))
      .subscribe({
        next: (items) => {
          this.allCities = items.map((c) => ({ value: c.name, label: c.name }));
        },
        error: () => {
          this.locationLoadError = 'Could not load cities for this country. Try selecting the country again.';
        },
      });
  }

  readonly maxSubjects = 4;

  readonly ageRanges: SelectOption[] = [
    { value: '', label: 'Select age range' },
    { value: 'UNDER-8', label: 'Under 8' },
    { value: '8-10', label: '8–10 years' },
    { value: '11-13', label: '11–13 years' },
    { value: '14-16', label: '14–16 years' },
    { value: '17-20', label: '17–20 years' },
    { value: '21-PLUS', label: '21 years and over' },
  ];

  readonly genders: SelectOption[] = [
    { value: '', label: 'Select gender' },
    { value: 'FEMALE', label: 'Female' },
    { value: 'MALE', label: 'Male' },
    { value: 'OTHER', label: 'Other' },
    { value: 'PREFER-NOT', label: 'Prefer not to say' },
  ];

  readonly currentLevels: SelectOption[] = [
    { value: '', label: 'Select current level' },
    { value: 'BEGINNER', label: 'Beginner' },
    { value: 'ELEMENTARY', label: 'Elementary' },
    { value: 'INTERMEDIATE', label: 'Intermediate' },
    { value: 'ADVANCED', label: 'Advanced' },
  ];

  private readonly allLessonFrequencyOptions: SelectOption[] = [
    { value: 'BIWEEKLY', label: 'Every two weeks' },
    { value: 'ONCE-WEEK', label: 'Once per week' },
    { value: 'TWICE-WEEK', label: 'Twice per week' },
    { value: 'THREE-WEEK', label: 'Three times per week' },
    { value: 'FOUR-PLUS-WEEK', label: 'Four or more times per week' },
    { value: 'FLEXIBLE', label: 'Flexible (to be agreed)' },
  ];

  selectedLessonFrequency = '';

  get availableLessonFrequencies(): SelectOption[] {
    const allowed = new Set(allowedLessonFrequencyCodes(this.selectedSubjectCount));
    return [
      { value: '', label: 'Select lesson frequency' },
      ...this.allLessonFrequencyOptions.filter((o) => allowed.has(o.value)),
    ];
  }

  get lessonFrequencyHint(): string | null {
    return lessonFrequencyConstraintHint(this.selectedSubjectCount);
  }

  readonly weekDays = WEEKDAYS;
  readonly timeSlots = LESSON_TIME_SLOTS;

  /** Selected DAY-SLOT codes, e.g. MON-MORNING */
  private readonly availabilitySelected = new Set<string>();

  subjectOptions: SubjectOption[] = [
    { value: 'QURAN-MEMORISATION', label: 'Quran memorisation', selected: false },
    { value: 'TAJWEED', label: 'Tajweed', selected: false },
    { value: 'ARABIC-LANGUAGE', label: 'Arabic language', selected: false },
    { value: 'QURAN-RECITATION-MASTERY', label: 'Quran recitation mastery', selected: false },
    { value: 'ISLAMIC-STUDIES', label: 'Islamic studies course', selected: false },
    { value: 'ISLAMIC-INHERITANCE', label: 'Islamic inheritance law', selected: false },
  ];

  get selectedSubjectCount(): number {
    return this.subjectOptions.filter((o) => o.selected).length;
  }

  isSubjectCheckboxDisabled(opt: SubjectOption): boolean {
    return !opt.selected && this.selectedSubjectCount >= this.maxSubjects;
  }

  get selectedAvailabilityCount(): number {
    return this.availabilitySelected.size;
  }

  isAvailabilitySelected(day: WeekdayCode, slot: LessonTimeSlotCode): boolean {
    return this.availabilitySelected.has(availabilitySlotKey(day, slot));
  }

  onAvailabilityChange(day: WeekdayCode, slot: LessonTimeSlotCode, event: Event): void {
    const input = event.target as HTMLInputElement;
    const key = availabilitySlotKey(day, slot);
    if (input.checked) this.availabilitySelected.add(key);
    else this.availabilitySelected.delete(key);
  }

  private collectPreferredAvailability(): string[] {
    return [...this.availabilitySelected];
  }

  onSubjectChange(opt: SubjectOption, event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.checked && this.selectedSubjectCount >= this.maxSubjects) {
      input.checked = false;
      return;
    }
    opt.selected = input.checked;
    this.enforceLessonFrequencyForSubjects();
  }

  private enforceLessonFrequencyForSubjects(): void {
    if (
      this.selectedLessonFrequency &&
      !isLessonFrequencyAllowed(this.selectedLessonFrequency, this.selectedSubjectCount)
    ) {
      this.selectedLessonFrequency = '';
    }
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    const form = event.target as HTMLFormElement;

    const firstName = this.firstName.trim();
    const lastName = this.lastName.trim();
    const ageRange = (form.elements.namedItem('age') as HTMLSelectElement)?.value ?? '';
    const gender = (form.elements.namedItem('gender') as HTMLSelectElement)?.value ?? '';
    const country =
      this.allCountries.find((o) => o.value === this.selectedCountryId)?.label?.trim() ?? '';
    const city = this.selectedCityName.trim();
    const currentLevel =
      (form.elements.namedItem('current-level') as HTMLSelectElement)?.value ?? '';
    const lessonFrequency = this.selectedLessonFrequency.trim();
    const subjectCodes = this.subjectOptions.filter((o) => o.selected).map((o) => o.value);

    if (!firstName || !lastName) {
      this.submitError = 'Please enter your first and last name.';
      return;
    }
    if (!ageRange || !gender || !country || !city || !currentLevel || !lessonFrequency) {
      this.submitError = 'Please complete all fields including country and city.';
      return;
    }
    if (subjectCodes.length === 0) {
      this.submitError = 'Select at least one subject.';
      return;
    }
    if (!isLessonFrequencyAllowed(lessonFrequency, subjectCodes.length)) {
      this.submitError =
        lessonFrequencyConstraintHint(subjectCodes.length) ??
        'Choose a lesson frequency that matches your subject selection.';
      return;
    }

    const preferredAvailability = this.collectPreferredAvailability();
    if (preferredAvailability.length === 0) {
      this.submitError = 'Select at least one preferred lesson time.';
      return;
    }

    const body: SaveOnboardingRequest = {
      firstName,
      lastName,
      ageRange,
      gender,
      country,
      city,
      currentLevel,
      lessonFrequency,
      subjectCodes,
      preferredAvailability,
    };

    this.submitError = null;
    this.submitting.set(true);
    this.auth
      .getBearerToken$()
      .pipe(
        switchMap((token) => {
          if (!token) {
            return throwError(
              () => new HttpErrorResponse({ status: 401, statusText: 'Not authenticated' }),
            );
          }
          return this.onboardingApi.save(body);
        }),
        switchMap(() => this.auth.refreshServerProfile()),
        switchMap(() => this.auth.markOnboardingCompleted().pipe(catchError(() => of(void 0)))),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: () => void this.router.navigate(['/dashboard']),
        error: (err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === 401) {
            this.submitError = 'Your session expired. Please sign in again.';
            void this.router.navigate(['/login']);
            return;
          }
          const body = err instanceof HttpErrorResponse ? err.error : null;
          const msg =
            body && typeof body === 'object' && body !== null && 'message' in body
              ? String((body as { message?: string }).message)
              : err instanceof HttpErrorResponse
                ? err.message
                : err instanceof Error
                  ? err.message
                  : null;
          this.submitError = msg || 'Could not submit your application. Try again.';
        },
      });
  }
}
