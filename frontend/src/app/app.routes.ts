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
    path: 'workspace/table/:tableId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/table-workspace/table-workspace.page').then((m) => m.TableWorkspacePageComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'calendar' },
      {
        path: 'calendar',
        loadComponent: () =>
          import('./pages/table-workspace/tabs/workspace-calendar.tab').then((m) => m.WorkspaceCalendarTabComponent),
      },
      {
        path: 'tasks',
        loadComponent: () =>
          import('./pages/table-workspace/tabs/workspace-tasks.tab').then((m) => m.WorkspaceTasksTabComponent),
      },
      {
        path: 'directories',
        loadComponent: () =>
          import('./pages/table-workspace/tabs/workspace-directories.tab').then((m) => m.WorkspaceDirectoriesTabComponent),
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./pages/table-workspace/tabs/workspace-analytics.tab').then((m) => m.WorkspaceAnalyticsTabComponent),
      },
    ],
  },
  {
    path: 'status',
    loadComponent: () => import('./pages/status/status.page').then((m) => m.StatusPageComponent),
  },
  { path: '**', redirectTo: 'auth/login' },
];
