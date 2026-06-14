import { Component } from '@angular/core';
import { MainSection } from './main-section/main-section';
import { ReviewsSection } from './reviews-section/reviews-section';
import { SecondarySection } from './secondary-section/secondary-section';
import { HowItWorks } from './how-it-works/how-it-works';

@Component({
  selector: 'app-homepage',
  imports: [MainSection, ReviewsSection, SecondarySection, HowItWorks],
  templateUrl: './homepage.html',
  styleUrl: './homepage.scss',
})
export class Homepage {

}
