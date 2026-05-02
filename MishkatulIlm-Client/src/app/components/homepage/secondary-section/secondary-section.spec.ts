import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SecondarySection } from './secondary-section';

describe('SecondarySection', () => {
  let component: SecondarySection;
  let fixture: ComponentFixture<SecondarySection>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SecondarySection]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SecondarySection);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
