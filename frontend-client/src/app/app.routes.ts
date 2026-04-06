import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home').then((m) => m.Home),
  },
  {
    path: 'signup',
    loadComponent: () =>
      import('./sign-up/sign-up').then((m) => m.SignupComponent),
  },
  {
    path: 'pending-approval',
    loadComponent: () =>
      import('./pending-approval/pending-approval').then(
        (m) => m.PendingApprovalComponent,
      ),
  },
  {
    path: 'console',
    loadComponent: () =>
      import('./console/console').then((m) => m.ConsolePageComponent),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login').then((m) => m.LoginComponent),
  }
];
