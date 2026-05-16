import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-signup',
  imports: [RouterLink],
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
})
export class Signup {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  submitError: string | null = null;

  onSubmit(event: Event): void {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const firstName = (form.elements.namedItem('firstName') as HTMLInputElement)?.value ?? '';
    const lastName = (form.elements.namedItem('lastName') as HTMLInputElement)?.value ?? '';
    const email = (form.elements.namedItem('email') as HTMLInputElement)?.value ?? '';
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

    if (!this.auth.supabaseConfigured()) {
      this.submitError =
        'Supabase is not configured. Add your anon key to the Angular environment file.';
      return;
    }

    this.auth
      .register({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      })
      .subscribe({
        next: (result) => {
          if (result.needsEmailConfirmation) {
            void this.router.navigate(['/verify-email'], {
              queryParams: { email: email.trim(), firstSent: '1' },
            });
            return;
          }
          const u = this.auth.user();
          if (u?.isAdmin) void this.router.navigate(['/admin']);
          else void this.router.navigate(['/onboarding']);
        },
        error: (err: Error & { message?: string }) => {
          this.submitError = err?.message || 'Could not create your account. Try again.';
        },
      });
  }
}
