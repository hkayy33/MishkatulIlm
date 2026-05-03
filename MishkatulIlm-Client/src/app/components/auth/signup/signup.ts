import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ONBOARDING_ACCESS_SESSION_KEY } from '../../../auth/onboarding-access-session';

@Component({
  selector: 'app-signup',
  imports: [RouterLink],
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
})
export class Signup {
  private readonly router = inject(Router);

  submitError: string | null = null;

  onSubmit(event: Event): void {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const password = (form.elements.namedItem('password') as HTMLInputElement)?.value ?? '';
    const confirm =
      (form.elements.namedItem('confirmPassword') as HTMLInputElement)?.value ?? '';
    const agreed = (form.elements.namedItem('terms') as HTMLInputElement)?.checked;

    if (password !== confirm) {
      this.submitError = 'Passwords do not match.';
      return;
    }
    if (!agreed) {
      this.submitError = 'Please accept the terms to continue.';
      return;
    }
    this.submitError = null;

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(ONBOARDING_ACCESS_SESSION_KEY, '1');
    }
    void this.router.navigate(['/onboarding']);
  }
}
