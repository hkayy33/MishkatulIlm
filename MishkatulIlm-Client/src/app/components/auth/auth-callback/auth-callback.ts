import { afterNextRender, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-auth-callback',
  templateUrl: './auth-callback.html',
  styleUrl: './auth-callback.scss',
})
export class AuthCallback {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly errorMessage = signal<string | null>(null);

  constructor() {
    afterNextRender(() => {
      void this.auth.completePostAuthLanding().catch(() => {
        this.errorMessage.set(
          'We could not finish signing you in. Try logging in with your email and password.',
        );
        void this.router.navigateByUrl('/login?authError=verify', { replaceUrl: true });
      });
    });
  }
}
