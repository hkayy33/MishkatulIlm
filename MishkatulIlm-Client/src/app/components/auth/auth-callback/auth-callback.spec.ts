import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { createAuthServiceStub } from '../../../core/testing/auth.service.stub';
import { AuthService } from '../../../core/services/auth.service';
import { AuthCallback } from './auth-callback';

describe('AuthCallback', () => {
  let component: AuthCallback;
  let fixture: ComponentFixture<AuthCallback>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthCallback],
      providers: [provideRouter([]), { provide: AuthService, useFactory: () => createAuthServiceStub() }],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthCallback);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
