import { afterNextRender, Component, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-auth-callback',
  templateUrl: './auth-callback.html',
  styleUrl: './auth-callback.scss',
})
export class AuthCallback {
  private readonly auth = inject(AuthService);

  constructor() {
    afterNextRender(() => {
      void this.auth.handleAuthRedirectResult();
    });
  }
}
