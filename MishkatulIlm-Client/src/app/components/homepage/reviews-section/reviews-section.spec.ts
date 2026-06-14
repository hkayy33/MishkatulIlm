import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReviewsSection } from './reviews-section';

describe('ReviewsSection', () => {
  let component: ReviewsSection;
  let fixture: ComponentFixture<ReviewsSection>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReviewsSection],
    }).compileComponents();

    fixture = TestBed.createComponent(ReviewsSection);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
