import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

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
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pending-approval/pending-approval').then(
        (m) => m.PendingApprovalComponent,
      ),
  },
  {
    path: 'console',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./console/console').then((m) => m.ConsolePageComponent),
  },
  {
    path: 'admin-dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./admin/admin-dashboard').then((m) => m.AdminDashboard),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login').then((m) => m.LoginComponent),
  },
  {
    path: 'login/success',
    loadComponent: () =>
      import('./login/login-success').then((m) => m.LoginSuccessComponent),
  },
  {
    path: 'personal-invitation',
    loadComponent: () =>
      import('./personal/personal-invitation/personal-invitation').then((m) => m.PersonalInvitation),
  },
  {
    path: 'auth/setup-password',
    loadComponent: () =>
      import('./personal/personal-invitation/personal-invitation').then((m) => m.PersonalInvitation),
  },
  {
    path: 'personal-dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./personal/personal-dashboard/personal-dashboard').then((m) => m.PersonalDashboard),
  },
  {
    path: 'entreprise-admin-dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./entreprise/entreprise-admin-dashboard/entreprise-admin-dashboard').then((m) => m.EntrepriseAdminDashboard),
  },
  {
    path: 'entreprise-user-dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./entreprise/entreprise-user/entreprise-user').then((m) => m.EntrepriseUserDashboard),
  },
  {
    path: 'suspended',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./suspanded/suspanded').then((m) => m.Suspended),
  },
  {
    path: 'vm-console',
    loadComponent: () =>
      import('./vm-console/vm-console').then((m) => m.VmConsoleComponent),
  }
];
