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

type OnboardingFieldKey =
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'age'
  | 'gender'
  | 'country'
  | 'city'
  | 'subjects'
  | 'currentLevel'
  | 'lessonFrequency'
  | 'availability';

const ONBOARDING_FIELD_FOCUS_ORDER: OnboardingFieldKey[] = [
  'firstName',
  'lastName',
  'phone',
  'age',
  'gender',
  'country',
  'city',
  'subjects',
  'currentLevel',
  'lessonFrequency',
  'availability',
];

const ONBOARDING_FIELD_ELEMENT_IDS: Record<OnboardingFieldKey, string> = {
  firstName: 'fname',
  lastName: 'lname',
  phone: 'phone',
  age: 'age',
  gender: 'gender',
  country: 'country',
  city: 'city',
  subjects: 'subjects-heading',
  currentLevel: 'current-level',
  lessonFrequency: 'lesson-frequency',
  availability: 'availability-heading',
};

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
  protected readonly invalidFields = signal<ReadonlySet<OnboardingFieldKey>>(new Set());
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
  phoneNumber = '';

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

  protected isInvalid(field: OnboardingFieldKey): boolean {
    return this.invalidFields().has(field);
  }

  protected clearInvalid(field: OnboardingFieldKey): void {
    if (!this.invalidFields().has(field)) return;
    const next = new Set(this.invalidFields());
    next.delete(field);
    this.invalidFields.set(next);
  }

  onCountrySelected(countryId: string): void {
    this.clearInvalid('country');
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
    { value: 'QURAN-RECITATION', label: 'Quran Recitation with tajweed', selected: false },
    { value: 'QURAN-MEMORISATION', label: 'Quran Memorization', selected: false },
    { value: 'ARABIC-LANGUAGE', label: 'Arabic Language', selected: false },
    { value: 'QURAN-RECITATION-MASTERY', label: 'Quran Recitation Mastery', selected: false },
    { value: 'ISLAMIC-STUDIES', label: 'Islamic Studies Course', selected: false },
    { value: 'ISLAMIC-INHERITANCE', label: 'Islamic Inheritance Law', selected: false },
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
    if (this.availabilitySelected.size > 0) this.clearInvalid('availability');
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
    if (this.selectedSubjectCount > 0) this.clearInvalid('subjects');
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
    const phone = this.phoneNumber.trim();
    const currentLevel =
      (form.elements.namedItem('current-level') as HTMLSelectElement)?.value ?? '';
    const lessonFrequency = this.selectedLessonFrequency.trim();
    const subjectCodes = this.subjectOptions.filter((o) => o.selected).map((o) => o.value);
    const preferredAvailability = this.collectPreferredAvailability();

    const invalid = this.collectInvalidFields({
      firstName,
      lastName,
      ageRange,
      gender,
      country,
      city,
      phone,
      currentLevel,
      lessonFrequency,
      subjectCount: subjectCodes.length,
      availabilityCount: preferredAvailability.length,
    });

    if (invalid.size > 0) {
      this.invalidFields.set(invalid);
      this.submitError = this.validationSummary(invalid, phone);
      this.scrollToFirstInvalid(invalid);
      return;
    }

    this.invalidFields.set(new Set());
    this.submitError = null;

    const body: SaveOnboardingRequest = {
      firstName,
      lastName,
      ageRange,
      gender,
      country,
      city,
      phoneNumber: phone,
      currentLevel,
      lessonFrequency,
      subjectCodes,
      preferredAvailability,
    };

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

  private collectInvalidFields(values: {
    firstName: string;
    lastName: string;
    ageRange: string;
    gender: string;
    country: string;
    city: string;
    phone: string;
    currentLevel: string;
    lessonFrequency: string;
    subjectCount: number;
    availabilityCount: number;
  }): Set<OnboardingFieldKey> {
    const invalid = new Set<OnboardingFieldKey>();
    if (!values.firstName) invalid.add('firstName');
    if (!values.lastName) invalid.add('lastName');
    if (!values.phone || values.phone.length < 7) invalid.add('phone');
    if (!values.ageRange) invalid.add('age');
    if (!values.gender) invalid.add('gender');
    if (!values.country || !this.selectedCountryId) invalid.add('country');
    if (!values.city) invalid.add('city');
    if (!values.currentLevel) invalid.add('currentLevel');
    if (
      !values.lessonFrequency ||
      !isLessonFrequencyAllowed(values.lessonFrequency, values.subjectCount)
    ) {
      invalid.add('lessonFrequency');
    }
    if (values.subjectCount === 0) invalid.add('subjects');
    if (values.availabilityCount === 0) invalid.add('availability');
    return invalid;
  }

  private validationSummary(invalid: ReadonlySet<OnboardingFieldKey>, phone: string): string {
    if (invalid.size === 1) {
      const field = [...invalid][0];
      switch (field) {
        case 'firstName':
          return 'Please enter your first name.';
        case 'lastName':
          return 'Please enter your last name.';
        case 'phone':
          return phone.length > 0
            ? 'Enter a valid phone number (at least 7 characters).'
            : 'Please enter your phone number.';
        case 'age':
          return 'Please select your age range.';
        case 'gender':
          return 'Please select your gender.';
        case 'country':
          return 'Please select your country.';
        case 'city':
          return 'Please select your city.';
        case 'subjects':
          return 'Select at least one subject.';
        case 'currentLevel':
          return 'Please select your current level.';
        case 'lessonFrequency':
          return (
            lessonFrequencyConstraintHint(this.selectedSubjectCount) ??
            'Please select a lesson frequency that matches your subjects.'
          );
        case 'availability':
          return 'Select at least one preferred lesson time.';
      }
    }
    return 'Please complete the highlighted fields below.';
  }

  private scrollToFirstInvalid(invalid: ReadonlySet<OnboardingFieldKey>): void {
    const first = ONBOARDING_FIELD_FOCUS_ORDER.find((key) => invalid.has(key));
    if (!first) return;
    const elementId = ONBOARDING_FIELD_ELEMENT_IDS[first];
    requestAnimationFrame(() => {
      const el = document.getElementById(elementId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        el.focus();
      }
    });
  }
}
