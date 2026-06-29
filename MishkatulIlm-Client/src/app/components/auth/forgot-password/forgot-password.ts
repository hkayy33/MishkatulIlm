import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  imports: [RouterLink],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPassword implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  submitError: string | null = null;
  submitInfo: string | null = null;
  submitBusy = false;
  emailSent = false;

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('authError') === 'recovery') {
      this.submitError =
        'That reset link could not sign you in. Request a new link and open it in the same browser where you clicked “Send reset link”.';
    }
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.submitBusy || this.emailSent) return;

    const form = event.target as HTMLFormElement;
    const email = (form.elements.namedItem('email') as HTMLInputElement)?.value?.trim() ?? '';

    this.submitError = null;
    this.submitInfo = null;

    if (!email) {
      this.submitError = 'Enter the email address for your account.';
      return;
    }

    if (!this.auth.supabaseConfigured()) {
      this.submitError = 'Password recovery is not available right now.';
      return;
    }

    this.submitBusy = true;
    this.auth.requestPasswordReset(email).subscribe({
      next: () => {
        this.submitBusy = false;
        this.emailSent = true;
        this.submitInfo =
          'If an account exists for that email, we sent a reset link. Open it in this browser (the same one you are using now), then choose a new password.';
      },
      error: (err: Error & { message?: string }) => {
        this.submitBusy = false;
        const msg = err?.message ?? '';
        if (/rate limit|too many requests/i.test(msg)) {
          this.submitError = 'Too many reset emails were sent. Wait a few minutes and try again.';
          return;
        }
        this.submitError = msg || 'Could not send the reset email. Try again.';
      },
    });
  }
}
