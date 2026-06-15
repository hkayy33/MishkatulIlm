import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { take } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { clearPasswordRecoveryPending } from '../../../core/supabase/auth-redirect';

@Component({
  selector: 'app-reset-password',
  imports: [FormsModule, RouterLink],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly newPassword = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly showNewPassword = signal(false);
  protected readonly showConfirmPassword = signal(false);

  submitError: string | null = null;
  submitBusy = false;

  ngOnInit(): void {
    this.auth
      .whenSessionReady$()
      .pipe(take(1))
      .subscribe((ready) => {
        if (!ready || !this.auth.isAuthenticated()) {
          void this.router.navigate(['/forgot-password'], { replaceUrl: true });
        }
      });
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.submitBusy) return;

    const next = this.newPassword();
    const confirm = this.confirmPassword();

    this.submitError = null;

    if (next.length < 8) {
      this.submitError = 'Password must be at least 8 characters.';
      return;
    }
    if (next !== confirm) {
      this.submitError = 'Passwords do not match.';
      return;
    }
    if (!this.auth.supabaseConfigured()) {
      this.submitError = 'Password reset is not available right now.';
      return;
    }

    this.submitBusy = true;
    this.auth.setPassword(next).subscribe({
      next: () => {
        this.submitBusy = false;
        clearPasswordRecoveryPending();
        const u = this.auth.user();
        if (u?.isAdmin) {
          void this.router.navigate(['/admin'], { replaceUrl: true });
        } else if (u?.onboardingCompleted) {
          void this.router.navigate(['/dashboard'], { replaceUrl: true });
        } else {
          void this.router.navigate(['/onboarding'], { replaceUrl: true });
        }
      },
      error: (err: Error & { message?: string }) => {
        this.submitBusy = false;
        this.submitError = err?.message || 'Could not update your password. Try the reset link again.';
      },
    });
  }
}
