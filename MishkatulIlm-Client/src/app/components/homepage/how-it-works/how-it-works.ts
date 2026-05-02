import { Component } from '@angular/core';
import { GetStartedBtn } from '../../get-started-btn/get-started-btn';

export type StepAccent = 'green' | 'gold';

export interface HowItWorksStep {
  n: number;
  title: string;
  description: string;
  accent: StepAccent;
}

@Component({
  selector: 'app-how-it-works',
  imports: [GetStartedBtn],
  templateUrl: './how-it-works.html',
  styleUrl: './how-it-works.scss',
})
export class HowItWorks {
  readonly steps: HowItWorksStep[] = [
    {
      n: 1,
      title: 'Sign Up',
      description: 'Create your account and tell us about your goals.',
      accent: 'green',
    },
    {
      n: 2,
      title: 'Get Matched',
      description: 'We match you with the perfect tutor.',
      accent: 'gold',
    },
    {
      n: 3,
      title: 'Start Learning',
      description: 'Begin your personalized learning journey.',
      accent: 'green',
    },
  ];
}
