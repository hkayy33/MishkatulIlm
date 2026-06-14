import { Component } from '@angular/core';

interface PricingPlan {
  hoursPerWeek: number;
  monthlyPrice: number;
}

@Component({
  selector: 'app-pricing-page',
  imports: [],
  templateUrl: './pricing-page.html',
  styleUrl: './pricing-page.scss',
})
export class PricingPage {
  readonly plans: PricingPlan[] = [
    { hoursPerWeek: 1, monthlyPrice: 20 },
    { hoursPerWeek: 2, monthlyPrice: 40 },
    { hoursPerWeek: 3, monthlyPrice: 60 },
    { hoursPerWeek: 4, monthlyPrice: 80 },
    { hoursPerWeek: 5, monthlyPrice: 100 },
    { hoursPerWeek: 6, monthlyPrice: 120 },
  ];
}
