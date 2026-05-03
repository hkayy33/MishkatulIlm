import { Routes } from '@angular/router';
import { Homepage } from './components/homepage/homepage';
import { PrivacyPolicy } from './pages/privacy-policy/privacy-policy';
import { TermsOfUse } from './pages/terms-of-use/terms-of-use';

export const routes: Routes = [
  { path: '', component: Homepage },
  { path: 'privacy', component: PrivacyPolicy },
  { path: 'terms', component: TermsOfUse },
];
