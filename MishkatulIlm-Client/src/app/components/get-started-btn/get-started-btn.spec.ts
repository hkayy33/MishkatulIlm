import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { GetStartedBtn } from './get-started-btn';

describe('GetStartedBtn', () => {
  let component: GetStartedBtn;
  let fixture: ComponentFixture<GetStartedBtn>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GetStartedBtn],
      providers: [provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(GetStartedBtn);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
