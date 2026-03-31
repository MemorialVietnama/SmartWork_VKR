import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'auth/login' },
  {
    path: 'auth/login',
    loadComponent: () => import('./pages/auth/login/login.page').then((m) => m.LoginPageComponent),
  },
  {
    path: 'auth/register',
    loadComponent: () => import('./pages/auth/register/register.page').then((m) => m.RegisterPageComponent),
  },
  {
    path: 'auth/invite-register',
    loadComponent: () => import('./pages/auth/invite-register/invite-register.page').then((m) => m.InviteRegisterPageComponent),
  },
  {
    path: 'auth/verify',
    loadComponent: () => import('./pages/auth/verify/verify.page').then((m) => m.VerifyPageComponent),
  },
  {
    path: 'auth/forgot-password',
    loadComponent: () => import('./pages/auth/forgot/forgot.page').then((m) => m.ForgotPasswordPageComponent),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./pages/auth/reset/reset.page').then((m) => m.ResetPasswordPageComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/dashboard/dashboard.page').then((m) => m.DashboardPageComponent),
  },
  {
    path: 'status',
    loadComponent: () => import('./pages/status/status.page').then((m) => m.StatusPageComponent),
  },
  { path: '**', redirectTo: 'auth/login' },
];
