import { Routes } from '@angular/router';
import { AboutUs } from './components/about-us/about-us';
import { Homepage } from './components/homepage/homepage';
import { PricingPage } from './components/pricing-page/pricing-page';
import { PrivacyPolicy } from './pages/privacy-policy/privacy-policy';
import { TermsOfUse } from './pages/terms-of-use/terms-of-use';
import { Onboarding } from './components/onboarding/onboarding';
import { Login } from './components/auth/login/login';
import { Signup } from './components/auth/signup/signup';
import { AuthCallback } from './components/auth/auth-callback/auth-callback';
import { VerifyEmail } from './components/auth/verify-email/verify-email';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { StudentDashboard } from './pages/student-dashboard/student-dashboard';

export const routes: Routes = [
  { path: '', component: Homepage },
  { path: 'about', component: AboutUs },
  { path: 'pricing', component: PricingPage },
  { path: 'dashboard', component: StudentDashboard, canActivate: [authGuard] },
  { path: 'privacy', component: PrivacyPolicy },
  { path: 'terms', component: TermsOfUse },
  { path: 'onboarding', component: Onboarding, canActivate: [authGuard] },
  { path: 'login', component: Login },
  { path: 'register', component: Signup },
  { path: 'verify-email', component: VerifyEmail },
  { path: 'auth/callback', component: AuthCallback },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./pages/admin/admin-layout/admin-layout').then((m) => m.AdminLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'summary' },
      {
        path: 'summary',
        loadComponent: () =>
          import('./pages/admin/admin-summary/admin-summary').then((m) => m.AdminSummary),
      },
      {
        path: 'pending',
        loadComponent: () =>
          import('./pages/admin/admin-pending/admin-pending').then((m) => m.AdminPending),
      },
      {
        path: 'schedule-changes',
        loadComponent: () =>
          import('./pages/admin/admin-schedule-changes/admin-schedule-changes').then(
            (m) => m.AdminScheduleChanges,
          ),
      },
      {
        path: 'students',
        loadComponent: () =>
          import('./pages/admin/admin-students/admin-students').then((m) => m.AdminStudents),
      },
      {
        path: 'calendar',
        loadComponent: () =>
          import('./pages/admin/admin-calendar/admin-calendar').then((m) => m.AdminCalendar),
      },
      {
        path: 'details',
        loadComponent: () =>
          import('./pages/admin/admin-details/admin-details').then((m) => m.AdminDetails),
      },
    ],
  },
];
