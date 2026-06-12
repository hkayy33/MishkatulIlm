import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-auth-callback',
  templateUrl: './auth-callback.html',
  styleUrl: './auth-callback.scss',
})
export class AuthCallback implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    void this.auth.completePostAuthLanding().catch((err) => {
      console.warn('[AuthCallback] completePostAuthLanding:', err);
      this.errorMessage.set(
        'We could not finish signing you in. Try logging in with your email and password.',
      );
      void this.router.navigateByUrl('/login?confirmed=1', { replaceUrl: true });
    });
  }
}
