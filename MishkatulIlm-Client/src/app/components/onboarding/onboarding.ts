import { Component, OnInit } from '@angular/core';
import { ONBOARDING_ACCESS_SESSION_KEY } from '../../auth/onboarding-access-session';
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
export class Onboarding implements OnInit {
  /** True after registration (session) or when a real auth layer sets access. */
  userLoggedIn = false;

  ngOnInit(): void {
    if (
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem(ONBOARDING_ACCESS_SESSION_KEY) === '1'
    ) {
      this.userLoggedIn = true;
    }
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
  }
}
