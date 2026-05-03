import { isPlatformBrowser } from '@angular/common';
import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const href = globalThis.location?.href ?? '';
    if (href.includes('code=')) {
      void this.auth.handleAuthRedirectResult();
      return;
    }

    const err = this.route.snapshot.queryParamMap.get('authError');
    if (err === 'verify') {
      this.submitError =
        'Email confirmation failed or the link expired. Try signing in, or register again and use a fresh confirmation link.';
    } else if (err === 'session') {
      this.submitError =
        'We could not establish a session from that link. Try signing in with your email and password.';
    }
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
        const completed = this.auth.user()?.onboardingCompleted === true;
        if (completed) void this.router.navigate(['/']);
        else void this.router.navigate(['/onboarding']);
      },
      error: (err: Error & { message?: string }) => {
        this.submitError = err?.message || 'Could not sign in. Try again.';
      },
    });
  }
}
