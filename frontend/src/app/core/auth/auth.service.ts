import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
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
  kpis?: Array<{
    key: string;
    title: string;
    value: number;
    unit?: string | null;
    delta_percent?: number | null;
  }>;
  periods?: Array<{
    period: string;
    values: number[];
  }>;
  segments?: Array<{
    key: string;
    label: string;
    value: number;
  }>;
  forecast?: {
    horizon: string;
    values: number[];
  } | null;
  anomalies?: Array<{
    date: string;
    title: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  breakdown?: Array<{
    label: string;
    value: number;
  }>;
}

export interface TableMemberBriefDto {
  user_id: number;
  short_name: string;
  is_owner: boolean;
}

export interface CalendarSlotDto {
  id: number;
  title: string;
  starts_at: string;
  ends_at: string;
}

export interface ShiftScheduleApplyResponse {
  detail: string;
  created_count: number;
  skipped_duplicates: number;
}

export interface WorkspaceTaskDto {
  id: number;
  title: string;
  status: string;
  assignee_user_id: number | null;
}

export interface WorkspaceDirectoryItemDto {
  id: number;
  label: string;
  value: string | null;
  payload?: Record<string, unknown> | null;
}

export interface WorkspaceDirectoryDto {
  id: number;
  name: string;
  description?: string | null;
  schema_fields?: Array<Record<string, unknown>>;
  kind?: string | null;
  items: WorkspaceDirectoryItemDto[];
}

export interface PresetDirectoriesRepairResultDto {
  detail: string;
  directories_created: number;
  example_items_added: number;
  skipped_nonempty_directories: number;
}

export interface WorkspaceOrderDto {
  id: number;
  title: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export interface TableBonusDto {
  key: string;
  qty: number;
}

export interface TableDetailDto {
  id: number;
  title: string;
  description?: string | null;
  preset?: string | null;
  custom_preset_name?: string | null;
  time_format?: string | null;
  week_start_day?: string | null;
  work_hours?: string | null;
  total_participants: number;
  owner_short_name: string;
  stats: TableStatsDto;
  can_edit_settings: boolean;
  bonuses: TableBonusDto[];
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

  requestDeleteTableCode(tableId: number): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(
      this.url(`/api/v1/tables/${tableId}/delete/request-code`),
      {},
      { headers: this.authHeaders() },
    );
  }

  confirmDeleteTable(tableId: number, code: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(
      this.url(`/api/v1/tables/${tableId}/delete/confirm`),
      { code },
      { headers: this.authHeaders() },
    );
  }

  myTables(): Observable<TableDto[]> {
    return this.http.get<TableDto[]>(this.url('/api/v1/tables/my'), { headers: this.authHeaders() });
  }

  myTablesAnalytics(opts?: { from?: string; to?: string; bucket?: 'day' | 'week' }): Observable<TableAnalyticsDto[]> {
    let params = new HttpParams();
    if (opts?.from) params = params.set('from', opts.from);
    if (opts?.to) params = params.set('to', opts.to);
    if (opts?.bucket) params = params.set('bucket', opts.bucket);
    return this.http.get<TableAnalyticsDto[]>(this.url('/api/v1/tables/analytics/my'), {
      headers: this.authHeaders(),
      params,
    });
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

  getTableDetail(tableId: number): Observable<TableDetailDto> {
    return this.http.get<TableDetailDto>(this.url(`/api/v1/tables/${tableId}`), { headers: this.authHeaders() });
  }

  patchTableDetail(
    tableId: number,
    payload: {
      title?: string;
      description?: string | null;
      time_format?: string;
      week_start_day?: string;
      work_hours?: string;
      color?: string | null;
    },
  ): Observable<TableDetailDto> {
    return this.http.patch<TableDetailDto>(this.url(`/api/v1/tables/${tableId}`), payload, { headers: this.authHeaders() });
  }

  listTableWorkspaceMembers(tableId: number): Observable<TableMemberBriefDto[]> {
    return this.http.get<TableMemberBriefDto[]>(
      this.url(`/api/v1/tables/${tableId}/workspace/members`),
      { headers: this.authHeaders() },
    );
  }

  getTableWorkspaceAnalytics(
    tableId: number,
    opts?: { from?: string; to?: string; bucket?: 'day' | 'week' },
  ): Observable<TableAnalyticsDto> {
    let params = new HttpParams();
    if (opts?.from) params = params.set('from', opts.from);
    if (opts?.to) params = params.set('to', opts.to);
    if (opts?.bucket) params = params.set('bucket', opts.bucket);
    return this.http.get<TableAnalyticsDto>(this.url(`/api/v1/tables/${tableId}/workspace/analytics`), {
      headers: this.authHeaders(),
      params,
    });
  }

  listCalendarSlots(tableId: number, from?: string, to?: string): Observable<CalendarSlotDto[]> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<CalendarSlotDto[]>(this.url(`/api/v1/tables/${tableId}/workspace/calendar/slots`), {
      headers: this.authHeaders(),
      params,
    });
  }

  createCalendarSlot(
    tableId: number,
    payload: { title: string; starts_at: string; ends_at: string },
  ): Observable<CalendarSlotDto> {
    return this.http.post<CalendarSlotDto>(
      this.url(`/api/v1/tables/${tableId}/workspace/calendar/slots`),
      payload,
      { headers: this.authHeaders() },
    );
  }

  deleteCalendarSlot(tableId: number, slotId: number): Observable<{ detail: string }> {
    return this.http.delete<{ detail: string }>(
      this.url(`/api/v1/tables/${tableId}/workspace/calendar/slots/${slotId}`),
      { headers: this.authHeaders() },
    );
  }

  updateCalendarSlot(
    tableId: number,
    slotId: number,
    payload: { title?: string; starts_at?: string; ends_at?: string },
  ): Observable<CalendarSlotDto> {
    return this.http.patch<CalendarSlotDto>(
      this.url(`/api/v1/tables/${tableId}/workspace/calendar/slots/${slotId}`),
      payload,
      { headers: this.authHeaders() },
    );
  }

  applyShiftSchedule(
    tableId: number,
    payload: {
      employee_user_id: number;
      weekdays: number[];
      start_time: string;
      end_time: string;
      weeks_ahead: number;
    },
  ): Observable<ShiftScheduleApplyResponse> {
    return this.http.post<ShiftScheduleApplyResponse>(
      this.url(`/api/v1/tables/${tableId}/workspace/shifts/apply`),
      payload,
      { headers: this.authHeaders() },
    );
  }

  listWorkspaceTasks(tableId: number): Observable<WorkspaceTaskDto[]> {
    return this.http.get<WorkspaceTaskDto[]>(this.url(`/api/v1/tables/${tableId}/workspace/tasks`), {
      headers: this.authHeaders(),
    });
  }

  createWorkspaceTask(
    tableId: number,
    payload: { title: string; status?: string; assignee_user_id?: number | null },
  ): Observable<WorkspaceTaskDto> {
    return this.http.post<WorkspaceTaskDto>(this.url(`/api/v1/tables/${tableId}/workspace/tasks`), payload, {
      headers: this.authHeaders(),
    });
  }

  updateWorkspaceTask(
    tableId: number,
    taskId: number,
    payload: { title?: string | null; status?: string | null; assignee_user_id?: number | null },
  ): Observable<WorkspaceTaskDto> {
    return this.http.patch<WorkspaceTaskDto>(
      this.url(`/api/v1/tables/${tableId}/workspace/tasks/${taskId}`),
      payload,
      { headers: this.authHeaders() },
    );
  }

  deleteWorkspaceTask(tableId: number, taskId: number): Observable<{ detail: string }> {
    return this.http.delete<{ detail: string }>(
      this.url(`/api/v1/tables/${tableId}/workspace/tasks/${taskId}`),
      { headers: this.authHeaders() },
    );
  }

  listWorkspaceDirectories(tableId: number): Observable<WorkspaceDirectoryDto[]> {
    return this.http.get<WorkspaceDirectoryDto[]>(this.url(`/api/v1/tables/${tableId}/workspace/directories`), {
      headers: this.authHeaders(),
    });
  }

  repairPresetWorkspaceDirectories(tableId: number): Observable<PresetDirectoriesRepairResultDto> {
    return this.http.post<PresetDirectoriesRepairResultDto>(
      this.url(`/api/v1/tables/${tableId}/workspace/directories/repair-preset`),
      {},
      { headers: this.authHeaders() },
    );
  }

  createWorkspaceDirectory(
    tableId: number,
    payload: { name: string; description?: string | null; schema_fields?: Array<Record<string, unknown>> },
  ): Observable<WorkspaceDirectoryDto> {
    return this.http.post<WorkspaceDirectoryDto>(
      this.url(`/api/v1/tables/${tableId}/workspace/directories`),
      payload,
      { headers: this.authHeaders() },
    );
  }

  addWorkspaceDirectoryItem(
    tableId: number,
    directoryId: number,
    payload: { label: string; value?: string | null; payload?: Record<string, unknown> | null },
  ): Observable<WorkspaceDirectoryItemDto> {
    return this.http.post<WorkspaceDirectoryItemDto>(
      this.url(`/api/v1/tables/${tableId}/workspace/directories/${directoryId}/items`),
      payload,
      { headers: this.authHeaders() },
    );
  }

  patchWorkspaceDirectoryItem(
    tableId: number,
    directoryId: number,
    itemId: number,
    body: { label?: string; value?: string | null; payload?: Record<string, unknown> | null },
  ): Observable<WorkspaceDirectoryItemDto> {
    return this.http.patch<WorkspaceDirectoryItemDto>(
      this.url(`/api/v1/tables/${tableId}/workspace/directories/${directoryId}/items/${itemId}`),
      body,
      { headers: this.authHeaders() },
    );
  }

  deleteWorkspaceDirectoryItem(
    tableId: number,
    directoryId: number,
    itemId: number,
  ): Observable<{ detail: string }> {
    return this.http.delete<{ detail: string }>(
      this.url(`/api/v1/tables/${tableId}/workspace/directories/${directoryId}/items/${itemId}`),
      { headers: this.authHeaders() },
    );
  }

  deleteWorkspaceDirectory(tableId: number, directoryId: number): Observable<{ detail: string }> {
    return this.http.delete<{ detail: string }>(
      this.url(`/api/v1/tables/${tableId}/workspace/directories/${directoryId}`),
      { headers: this.authHeaders() },
    );
  }

  listWorkspaceOrders(
    tableId: number,
    opts?: { status?: string; limit?: number; offset?: number },
  ): Observable<WorkspaceOrderDto[]> {
    let params = new HttpParams();
    if (opts?.status) params = params.set('status', opts.status);
    if (opts?.limit != null) params = params.set('limit', String(opts.limit));
    if (opts?.offset != null) params = params.set('offset', String(opts.offset));
    return this.http.get<WorkspaceOrderDto[]>(this.url(`/api/v1/tables/${tableId}/workspace/orders`), {
      headers: this.authHeaders(),
      params,
    });
  }

  createWorkspaceOrder(tableId: number, title: string): Observable<WorkspaceOrderDto> {
    return this.http.post<WorkspaceOrderDto>(
      this.url(`/api/v1/tables/${tableId}/workspace/orders`),
      { title },
      { headers: this.authHeaders() },
    );
  }

  updateWorkspaceOrder(tableId: number, orderId: number, status: string): Observable<WorkspaceOrderDto> {
    return this.http.patch<WorkspaceOrderDto>(
      this.url(`/api/v1/tables/${tableId}/workspace/orders/${orderId}`),
      { status },
      { headers: this.authHeaders() },
    );
  }

  saveToken(resp: AuthResponse): void {
    localStorage.setItem(this.TOKEN_KEY, resp.access_token);
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    void this.router.navigate(['/welcome']);
  }
}

