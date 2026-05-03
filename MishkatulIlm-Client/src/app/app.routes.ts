import { Routes } from '@angular/router';
import { Homepage } from './components/homepage/homepage';
import { PrivacyPolicy } from './pages/privacy-policy/privacy-policy';
import { TermsOfUse } from './pages/terms-of-use/terms-of-use';
import { Onboarding } from './components/onboarding/onboarding';
import { Login } from './components/auth/login/login';
import { Signup } from './components/auth/signup/signup';
import { AuthCallback } from './components/auth/auth-callback/auth-callback';
import { VerifyEmail } from './components/auth/verify-email/verify-email';

export const routes: Routes = [
  { path: '', component: Homepage },
  { path: 'privacy', component: PrivacyPolicy },
  { path: 'terms', component: TermsOfUse },
  { path: 'onboarding', component: Onboarding },
  { path: 'login', component: Login },
  { path: 'register', component: Signup },
  { path: 'verify-email', component: VerifyEmail },
  { path: 'auth/callback', component: AuthCallback },
];
