import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { switchMap } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import type { SaveOnboardingRequest } from '../../core/models/onboarding.models';
import { OnboardingApiService } from '../../core/services/onboarding-api.service';
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
  imports: [Auth],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
})
export class Onboarding {
  protected readonly auth = inject(AuthService);
  private readonly onboardingApi = inject(OnboardingApiService);
  private readonly router = inject(Router);

  submitError: string | null = null;

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

  readonly lessonFrequencies: SelectOption[] = [
    { value: '', label: 'Select lesson frequency' },
    { value: 'BIWEEKLY', label: 'Every two weeks' },
    { value: 'ONCE-WEEK', label: 'Once per week' },
    { value: 'TWICE-WEEK', label: 'Twice per week' },
    { value: 'THREE-WEEK', label: 'Three times per week' },
    { value: 'FOUR-PLUS-WEEK', label: 'Four or more times per week' },
    { value: 'FLEXIBLE', label: 'Flexible (to be agreed)' },
  ];

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

  onSubjectChange(opt: SubjectOption, event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.checked && this.selectedSubjectCount >= this.maxSubjects) {
      input.checked = false;
      return;
    }
    opt.selected = input.checked;
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    const form = event.target as HTMLFormElement;

    const firstName = (form.elements.namedItem('fname') as HTMLInputElement)?.value?.trim() ?? '';
    const lastName = (form.elements.namedItem('lname') as HTMLInputElement)?.value?.trim() ?? '';
    const ageRange = (form.elements.namedItem('age') as HTMLSelectElement)?.value ?? '';
    const gender = (form.elements.namedItem('gender') as HTMLSelectElement)?.value ?? '';
    const currentLevel =
      (form.elements.namedItem('current-level') as HTMLSelectElement)?.value ?? '';
    const lessonFrequency =
      (form.elements.namedItem('lesson-frequency') as HTMLSelectElement)?.value ?? '';

    const subjectCodes = this.subjectOptions.filter((o) => o.selected).map((o) => o.value);

    if (!firstName || !lastName) {
      this.submitError = 'Please enter your first and last name.';
      return;
    }
    if (!ageRange || !gender || !currentLevel || !lessonFrequency) {
      this.submitError = 'Please complete all dropdown fields.';
      return;
    }
    if (subjectCodes.length === 0) {
      this.submitError = 'Select at least one subject.';
      return;
    }

    const body: SaveOnboardingRequest = {
      firstName,
      lastName,
      ageRange,
      gender,
      currentLevel,
      lessonFrequency,
      subjectCodes,
    };

    this.submitError = null;
    this.onboardingApi
      .save(body)
      .pipe(switchMap(() => this.auth.markOnboardingCompleted()))
      .subscribe({
        next: () => void this.router.navigate(['/']),
        error: (err: { error?: { message?: string }; message?: string }) => {
          const msg = err?.error?.message ?? err?.message;
          this.submitError =
            typeof msg === 'string' ? msg : 'Could not submit your application. Try again.';
        },
      });
  }
}
