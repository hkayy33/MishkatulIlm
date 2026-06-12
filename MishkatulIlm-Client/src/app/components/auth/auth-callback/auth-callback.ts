import { Component, inject, OnInit, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { isAuthCallbackRoute } from '../../../core/supabase/auth-redirect';

@Component({
  selector: 'app-auth-callback',
  templateUrl: './auth-callback.html',
  styleUrl: './auth-callback.scss',
})
export class AuthCallback implements OnInit {
  private readonly auth = inject(AuthService);

  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    void this.auth.completePostAuthLanding().catch((err) => {
      console.warn('[AuthCallback] completePostAuthLanding:', err);
      if (isAuthCallbackRoute(globalThis.location?.pathname ?? '')) {
        this.errorMessage.set(
          'We could not finish signing you in. Try logging in with your email and password.',
        );
      }
    });
  }
}
