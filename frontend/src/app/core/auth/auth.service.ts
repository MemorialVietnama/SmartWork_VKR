import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface MeDto {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  login: string;
  role: string;
}

export interface TableStatsDto {
  active_employees: number;
  queued_orders: number;
  tasks_done: number;
  tasks_waiting: number;
  tasks_new: number;
}

export interface TableDto {
  id: number;
  title: string;
  description?: string | null;
  color?: string | null;
  total_participants: number;
  owner_short_name: string;
  stats: TableStatsDto;
}

export interface AnalyticsMiniChartDto {
  title: string;
  subtitle: string;
  values: number[];
}

export interface TableAnalyticsDto {
  table_id: number;
  table_name: string;
  participants: number;
  active_employees: number;
  queued_orders: number;
  charts: AnalyticsMiniChartDto[];
}

export interface TableBonusDto {
  key: string;
  qty: number;
}

export interface TableSubscriptionDto {
  table_id: number;
  bonuses: TableBonusDto[];
}

export interface TempCredentialsDto {
  login: string;
  password: string;
  expires_at: string;
}

export interface EmployeeDto {
  id: number;
  last_name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  birth_date?: string | null;
  phone?: string | null;
  email?: string | null;
  position?: string | null;
  note?: string | null;
  temp_credentials?: TempCredentialsDto | null;
}

export interface InviteInfoDto {
  owner_short_name: string;
  table_id?: number | null;
  table_title?: string | null;
  expires_at: string;
}

export interface RegisterByInviteResponse {
  detail: string;
  login: string;
  owner_short_name: string;
}

export interface EmployeeTableBindingDto {
  employee_id: number;
  table_ids: number[];
}

export interface SecuritySettingsDto {
  email_masked: string;
  password_masked: string;
}

export interface NotificationSourcesDto {
  system: boolean;
  tables: boolean;
  employees: boolean;
}

export interface NotificationTargetsDto {
  desktop: boolean;
  mobile: boolean;
  email: boolean;
}

export interface NotificationSettingsDto {
  sources: NotificationSourcesDto;
  targets: NotificationTargetsDto;
}

export interface AppearanceSettingsDto {
  theme: 'light' | 'dark' | 'auto';
  density: 'compact' | 'comfortable';
  card_size: 'small' | 'medium' | 'large';
}

export interface AccountSettingsDto {
  first_name?: string | null;
  last_name?: string | null;
  login: string;
  security: SecuritySettingsDto;
}

export interface UserSettingsDto {
  account: AccountSettingsDto;
  appearance: AppearanceSettingsDto;
  notifications: NotificationSettingsDto;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly TOKEN_KEY = 'smartwork_access_token';

  private url(path: string): string {
    const base = environment.apiUrl.replace(/\/$/, '');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
  }

  get accessToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.accessToken;
  }

  private authHeaders(): HttpHeaders {
    const token = this.accessToken;
    return new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {});
  }

  registerRequestCode(payload: {
    first_name: string;
    last_name: string;
    login: string;
    password: string;
    password_confirm: string;
    role: 'owner' | 'staff';
  }): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(this.url('/api/v1/auth/register/request-code'), payload);
  }

  registerConfirm(login: string, code: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(this.url('/api/v1/auth/register/confirm'), { login, code });
  }

  resendRegisterCode(login: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(this.url('/api/v1/auth/register/resend-code'), { login });
  }

  login(login: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(this.url('/api/v1/auth/login'), { login, password });
  }

  forgotPassword(login: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(this.url('/api/v1/auth/forgot-password'), { login });
  }

  resetPassword(token: string, newPassword: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(this.url('/api/v1/auth/reset-password'), {
      token,
      new_password: newPassword,
    });
  }

  socialLogin(provider: string): Observable<AuthResponse> {
    return this.http.get<AuthResponse>(this.url(`/api/v1/auth/oauth/${provider}`));
  }

  me(): Observable<MeDto> {
    return this.http.get<MeDto>(this.url('/api/v1/auth/me'), { headers: this.authHeaders() });
  }

  requestCreateTableCode(payload: {
    title: string;
    description?: string | null;
    preset: string;
    custom_preset_name?: string | null;
    selected_employee_ids: number[];
    bonus_keys: string[];
    time_format: 'us' | 'eu';
    week_start_day: string;
    work_hours: string;
  }): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(this.url('/api/v1/tables/create/request-code'), payload, { headers: this.authHeaders() });
  }

  confirmCreateTable(code: string): Observable<TableDto> {
    return this.http.post<TableDto>(this.url('/api/v1/tables/create/confirm'), { code }, { headers: this.authHeaders() });
  }

  myTables(): Observable<TableDto[]> {
    return this.http.get<TableDto[]>(this.url('/api/v1/tables/my'), { headers: this.authHeaders() });
  }

  myTablesAnalytics(): Observable<TableAnalyticsDto[]> {
    return this.http.get<TableAnalyticsDto[]>(this.url('/api/v1/tables/analytics/my'), { headers: this.authHeaders() });
  }

  myTableSubscriptions(): Observable<TableSubscriptionDto[]> {
    return this.http.get<TableSubscriptionDto[]>(this.url('/api/v1/tables/subscriptions/my'), { headers: this.authHeaders() });
  }

  updateTableSubscription(tableId: number, payload: { bonuses: TableBonusDto[] }): Observable<TableSubscriptionDto> {
    return this.http.put<TableSubscriptionDto>(this.url(`/api/v1/tables/${tableId}/subscriptions`), payload, { headers: this.authHeaders() });
  }

  addTableMember(tableId: number, employeeId: number): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(this.url(`/api/v1/tables/${tableId}/members`), { employee_id: employeeId }, { headers: this.authHeaders() });
  }

  myEmployees(): Observable<EmployeeDto[]> {
    return this.http.get<EmployeeDto[]>(this.url('/api/v1/employees/my'), { headers: this.authHeaders() });
  }

  createEmployee(payload: {
    last_name: string;
    first_name: string;
    middle_name?: string | null;
    birth_date: string;
    phone: string;
    email?: string | null;
    position: string;
    note?: string | null;
  }): Observable<EmployeeDto> {
    return this.http.post<EmployeeDto>(this.url('/api/v1/employees'), payload, { headers: this.authHeaders() });
  }

  updateEmployee(
    employeeId: number,
    payload: {
      last_name: string;
      first_name: string;
      middle_name?: string | null;
      birth_date: string;
      phone: string;
      position: string;
      note?: string | null;
    },
  ): Observable<EmployeeDto> {
    return this.http.put<EmployeeDto>(this.url(`/api/v1/employees/${employeeId}`), payload, { headers: this.authHeaders() });
  }

  detachEmployee(employeeId: number): Observable<{ detail: string }> {
    return this.http.delete<{ detail: string }>(this.url(`/api/v1/employees/${employeeId}`), { headers: this.authHeaders() });
  }

  employeeTableBindings(): Observable<EmployeeTableBindingDto[]> {
    return this.http.get<EmployeeTableBindingDto[]>(this.url('/api/v1/employees/table-bindings'), { headers: this.authHeaders() });
  }

  updateEmployeeTableBindings(employeeId: number, tableIds: number[]): Observable<EmployeeTableBindingDto> {
    return this.http.put<EmployeeTableBindingDto>(
      this.url(`/api/v1/employees/${employeeId}/table-bindings`),
      { table_ids: tableIds },
      { headers: this.authHeaders() },
    );
  }

  createTableInvite(tableId: number): Observable<{ code: string; expires_at: string }> {
    return this.http.post<{ code: string; expires_at: string }>(this.url('/api/v1/employees/invite'), { table_id: tableId }, { headers: this.authHeaders() });
  }

  acceptTableInvite(code: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(this.url('/api/v1/employees/accept-invite'), { code }, { headers: this.authHeaders() });
  }

  inviteInfo(code: string): Observable<InviteInfoDto> {
    return this.http.get<InviteInfoDto>(this.url(`/api/v1/employees/invite/${code}`));
  }

  registerByInvite(
    code: string,
    payload: {
      last_name: string;
      first_name: string;
      middle_name?: string | null;
      birth_date: string;
      phone: string;
      email: string;
      avatar_data_url?: string | null;
    },
  ): Observable<RegisterByInviteResponse> {
    return this.http.post<RegisterByInviteResponse>(this.url(`/api/v1/employees/invite/${code}/register`), payload);
  }

  mySettings(): Observable<UserSettingsDto> {
    return this.http.get<UserSettingsDto>(this.url('/api/v1/settings/me'), { headers: this.authHeaders() });
  }

  updateMySettings(payload: {
    appearance: AppearanceSettingsDto;
    notifications: NotificationSettingsDto;
  }): Observable<UserSettingsDto> {
    return this.http.put<UserSettingsDto>(this.url('/api/v1/settings/me'), payload, { headers: this.authHeaders() });
  }

  saveToken(resp: AuthResponse): void {
    localStorage.setItem(this.TOKEN_KEY, resp.access_token);
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    void this.router.navigate(['/auth/login']);
  }
}

