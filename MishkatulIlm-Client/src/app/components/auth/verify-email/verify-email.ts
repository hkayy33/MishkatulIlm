import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

/** Supabase already sent a confirmation on register; avoid immediate resend spam. */
const FIRST_SIGNUP_COOLDOWN_SEC = 90;
/** Minimum gap between successful resend calls (client-side guard). */
const RESEND_SUCCESS_COOLDOWN_SEC = 120;
/** After a rate-limit response, block resend button for a while. */
const RATE_LIMIT_COOLDOWN_SEC = 300;

function isAuthRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const o = err as { status?: number; message?: string };
  if (o.status === 429) return true;
  const m = (o.message ?? '').toLowerCase();
  return (
    m.includes('rate limit') ||
    m.includes('too many requests') ||
    m.includes('email rate limit') ||
    m.includes('only request this')
  );
}

function formatResendError(err: unknown): string {
  if (isAuthRateLimitError(err)) {
    return 'Too many confirmation emails were sent. Wait several minutes, then try again, or check your spam folder for the last message.';
  }
  const msg = err instanceof Error ? err.message : String(err);
  return msg || 'Could not resend the email. Try again later.';
}

@Component({
  selector: 'app-verify-email',
  imports: [RouterLink],
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.scss',
})
export class VerifyEmail implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  email = this.route.snapshot.queryParamMap.get('email')?.trim() ?? '';

  submitError: string | null = null;
  submitInfo: string | null = null;
  resendBusy = false;
  readonly cooldownSec = signal(0);

  private cooldownTicker: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    if (!this.email) {
      void this.router.navigate(['/register']);
      return;
    }
    if (this.route.snapshot.queryParamMap.get('firstSent') === '1') {
      this.startCooldown(FIRST_SIGNUP_COOLDOWN_SEC);
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { email: this.email },
        replaceUrl: true,
      });
    }
  }

  ngOnDestroy(): void {
    this.stopCooldownTicker();
  }

  resend(): void {
    if (!this.email || this.resendBusy || this.cooldownSec() > 0) return;
    if (!this.auth.supabaseConfigured()) {
      this.submitError = 'Supabase is not configured.';
      return;
    }
    this.submitError = null;
    this.submitInfo = null;
    this.resendBusy = true;
    this.auth.resendSignupConfirmation(this.email).subscribe({
      next: () => {
        this.resendBusy = false;
        this.submitInfo = 'Another confirmation email has been sent. Check your inbox and spam folder.';
        this.startCooldown(RESEND_SUCCESS_COOLDOWN_SEC);
      },
      error: (err: unknown) => {
        this.resendBusy = false;
        this.submitError = formatResendError(err);
        if (isAuthRateLimitError(err)) {
          this.startCooldown(RATE_LIMIT_COOLDOWN_SEC);
        }
      },
    });
  }

  private startCooldown(seconds: number): void {
    this.stopCooldownTicker();
    this.cooldownSec.set(seconds);
    this.cooldownTicker = setInterval(() => {
      const next = this.cooldownSec() - 1;
      if (next <= 0) {
        this.cooldownSec.set(0);
        this.stopCooldownTicker();
      } else {
        this.cooldownSec.set(next);
      }
    }, 1000);
  }

  private stopCooldownTicker(): void {
    if (this.cooldownTicker != null) {
      clearInterval(this.cooldownTicker);
      this.cooldownTicker = null;
    }
  }
}
