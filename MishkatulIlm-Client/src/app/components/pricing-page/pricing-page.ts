import { Component } from '@angular/core';
import {
  LESSON_RATE_45_MIN_USD,
  LESSON_RATE_60_MIN_USD,
  monthlyPriceForLessonsPerWeek,
} from '../../core/utils/lesson-pricing';

interface PricingPlan {
  lessonsPerWeek: number;
  monthlyPrice: number;
}

@Component({
  selector: 'app-pricing-page',
  imports: [],
  templateUrl: './pricing-page.html',
  styleUrl: './pricing-page.scss',
})
export class PricingPage {
  readonly rate45MinUsd = LESSON_RATE_45_MIN_USD;
  readonly rate60MinUsd = LESSON_RATE_60_MIN_USD;

  readonly lessonsPerWeekOptions = [1, 2, 3, 4, 5, 6] as const;

  readonly fortyFiveMinutePlans: PricingPlan[] = this.lessonsPerWeekOptions.map((lessonsPerWeek) => ({
    lessonsPerWeek,
    monthlyPrice: monthlyPriceForLessonsPerWeek(lessonsPerWeek, 45),
  }));

  readonly sixtyMinutePlans: PricingPlan[] = this.lessonsPerWeekOptions.map((lessonsPerWeek) => ({
    lessonsPerWeek,
    monthlyPrice: monthlyPriceForLessonsPerWeek(lessonsPerWeek, 60),
  }));
}
