import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { createAuthServiceStub } from '../../core/testing/auth.service.stub';
import { AuthService } from '../../core/services/auth.service';
import { Onboarding } from './onboarding';

describe('Onboarding', () => {
  let component: Onboarding;
  let fixture: ComponentFixture<Onboarding>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Onboarding],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: AuthService, useFactory: () => createAuthServiceStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Onboarding);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
