import { isPlatformBrowser } from '@angular/common';
import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);

  submitError: string | null = null;
  submitInfo: string | null = null;

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.route.snapshot.queryParamMap.get('confirmed') === '1') {
      this.submitInfo =
        'Your email is confirmed. Sign in with your password to continue to onboarding.';
    }

    const err = this.route.snapshot.queryParamMap.get('authError');
    if (err === 'verify') {
      this.submitError =
        'Email confirmation failed or the link expired. Try signing in, or register again and use a fresh confirmation link.';
    } else if (err === 'session') {
      this.submitInfo =
        'Your email is confirmed. Sign in with your password below to continue to onboarding.';
    }

    this.auth
      .whenSessionReady$()
      .pipe(take(1))
      .subscribe((ready) => {
        if (!ready) return;
        const u = this.auth.user();
        if (u?.isAdmin) void this.router.navigate(['/admin'], { replaceUrl: true });
        else if (u?.onboardingCompleted) void this.router.navigate(['/dashboard'], { replaceUrl: true });
        else void this.router.navigate(['/onboarding'], { replaceUrl: true });
      });
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const email = (form.elements.namedItem('email') as HTMLInputElement)?.value ?? '';
    const password = (form.elements.namedItem('password') as HTMLInputElement)?.value ?? '';

    this.submitError = null;

    if (!this.auth.supabaseConfigured()) {
      this.submitError =
        'Supabase is not configured. Add your anon key to the Angular environment file.';
      return;
    }

    this.auth.login({ email: email.trim(), password }).subscribe({
      next: () => {
        const u = this.auth.user();
        if (u?.isAdmin) void this.router.navigate(['/admin']);
        else if (u?.onboardingCompleted) void this.router.navigate(['/dashboard']);
        else void this.router.navigate(['/onboarding']);
      },
      error: (err: Error & { message?: string }) => {
        const msg = err?.message || 'Could not sign in. Try again.';
        if (/email not confirmed/i.test(msg)) {
          this.submitError =
            'Your email is not verified yet. Open the latest confirmation email and click the link, or register again to get a new one.';
          return;
        }
        this.submitError = msg;
      },
    });
  }
}
