import { Component, ViewEncapsulation, inject, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { InputTextModule } from 'primeng/inputtext';
import { InputSwitchModule } from 'primeng/inputswitch';
import { ChartModule } from 'primeng/chart';
import { DialogModule } from 'primeng/dialog';
import { DashboardSidebarComponent } from './components/sidebar/dashboard-sidebar.component';
import { DashboardInviteDialogComponent } from './dialogs/invite-dialog/dashboard-invite-dialog.component';
import { DashboardLogoutConfirmDialogComponent } from './dialogs/logout-confirm-dialog/dashboard-logout-confirm-dialog.component';
import { DashboardTableMembersDialogComponent } from './dialogs/table-members-dialog/dashboard-table-members-dialog.component';
import { DashboardEmployeeDialogComponent } from './dialogs/employee-dialog/dashboard-employee-dialog.component';
import { DashboardTableCreateDialogComponent } from './dialogs/table-create-dialog/dashboard-table-create-dialog.component';
import { TableCreateOtgComponent } from './components/table-create-otg/table-create-otg.component';
import { DashboardTablesCategoryComponent } from './categories/tables/dashboard-tables-category.component';
import { DashboardEmployeesCategoryComponent } from './categories/employees/dashboard-employees-category.component';
import { DashboardAnalyticsCategoryComponent } from './categories/analytics/dashboard-analytics-category.component';
import { DashboardSettingsCategoryComponent } from './categories/settings/dashboard-settings-category.component';
import { DashboardSubscriptionCategoryComponent } from './categories/subscription/dashboard-subscription-category.component';
import { DashboardJoinTableDialogComponent } from './dialogs/join-table-dialog/dashboard-join-table-dialog.component';
import { DashboardNotificationsCenterComponent } from './components/notifications-center/dashboard-notifications-center.component';

import {
  AuthService,
  EmployeeDto,
  DetachRequestDto,
  DetachRequestStatusDto,
  InviteInfoDto,
  MeDto,
  NotificationSettingsDto,
  UserNotificationDto,
  TableAnalyticsDto,
  TableDto,
  UserSettingsDto,
} from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    FormsModule,
    CardModule,
    ButtonModule,
    TagModule,
    MessageModule,
    ProgressSpinnerModule,
    InputTextModule,
    InputSwitchModule,
    ChartModule,
    DialogModule,
    DashboardSidebarComponent,
    DashboardInviteDialogComponent,
    DashboardLogoutConfirmDialogComponent,
    DashboardTableMembersDialogComponent,
    DashboardEmployeeDialogComponent,
    DashboardTableCreateDialogComponent,
    TableCreateOtgComponent,
    DashboardTablesCategoryComponent,
    DashboardEmployeesCategoryComponent,
    DashboardAnalyticsCategoryComponent,
    DashboardSettingsCategoryComponent,
    DashboardSubscriptionCategoryComponent,
    DashboardJoinTableDialogComponent,
    DashboardNotificationsCenterComponent,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DashboardPageComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly themeService = inject(ThemeService);
  private readonly analyticsBonusKey = 'unlock_analytics';
  private liveRefreshTimerId: ReturnType<typeof setInterval> | null = null;

  protected user: MeDto | null = null;
  protected loading = true;
  protected error: string | null = null;
  protected selectedCategory: SidebarCategoryId = 'tables';
  protected readonly categories: SidebarCategory[] = [
    { id: 'tables', label: 'Столы', icon: 'pi pi-th-large' },
    { id: 'employees', label: 'Сотрудники', icon: 'pi pi-users' },
    { id: 'analytics', label: 'Аналитика', icon: 'pi pi-chart-bar' },
    { id: 'settings', label: 'Настройки', icon: 'pi pi-cog' },
    { id: 'subscription', label: 'Подписка', icon: 'pi pi-wallet' },
    { id: 'logout', label: 'Выход', icon: 'pi pi-sign-out' },
  ];

  protected ownerTables: WorkspaceTableCard[] = [];
  protected tableDialogVisible = false;
  protected tableFormError: string | null = null;
  protected creatingTable = false;
  protected tableCodeDialogVisible = false;
  protected tableCreateCode = '';
  protected tableForm: TableCreateForm = this.createEmptyTableForm();
  protected tableCreateStep = 1;
  protected analyticsTables: TableAnalytics[] = [];
  protected analyticsPeriod: AnalyticsPeriod = '30d';
  protected analyticsCompareWithPrevious = false;
  protected analyticsSelectedTableId: number | null = null;
  protected analyticsSelectedKpi: AnalyticsKpiKey = 'overview';
  protected analyticsDrilldownChartTitle: string | null = null;
  protected readonly analyticsPeriods: Array<{ id: AnalyticsPeriod; label: string }> = [
    { id: '7d', label: '7 дней' },
    { id: '30d', label: '30 дней' },
    { id: '90d', label: '90 дней' },
    { id: '365d', label: '365 дней' },
  ];
  protected ownerEmployees: EmployeeCard[] = [];
  protected employeeTableSelections: Record<number, number[]> = {};
  protected employeeTableEditMode: Record<number, boolean> = {};
  protected employeeTableBindingMessage: Record<number, string | null> = {};
  protected detachedEmployeesCount = 0;
  protected employeeDialogVisible = false;
  protected employeeDialogMode: 'create' | 'edit' = 'create';
  protected inviteDialogVisible = false;
  protected inviteGenerating = false;
  protected inviteError: string | null = null;
  protected inviteType: 'code' | 'link' = 'link';
  protected inviteTableId: number | null = null;
  protected inviteCode = '';
  protected inviteLink = '';
  protected joinDialogVisible = false;
  protected joinCode = '';
  protected joinPreview: JoinInvitePreview | null = null;
  protected joinLoading = false;
  protected joinPreviewLoading = false;
  protected joinError: string | null = null;
  protected joinSuccess: string | null = null;
  protected staffInviteCode = '';
  protected staffInviteMessage: string | null = null;
  protected staffDetachDialogVisible = false;
  protected staffDetachReason = '';
  protected staffDetachTableId: number | null = null;
  protected staffDetachError: string | null = null;
  protected staffDetachLoading = false;
  protected notificationsDialogVisible = false;
  protected notificationsLoading = false;
  protected notificationsError: string | null = null;
  protected notifications: DashboardNotification[] = [];
  protected unreadNotifications = 0;
  protected staffDetachStatusByTable: Record<number, StaffDetachStatusLabel> = {};
  protected ownerDetachDialogVisible = false;
  protected ownerDetachRequest: OwnerDetachRequestView | null = null;
  protected ownerDetachError: string | null = null;
  protected ownerDetachLoading = false;
  protected auditEvents: DashboardAuditEvent[] = [];
  protected logoutConfirmVisible = false;
  protected openedTableMenuId: number | null = null;
  protected tableMembersDialogVisible = false;
  protected selectedTableForMembers: WorkspaceTableCard | null = null;
  protected tableMembersActionError: string | null = null;
  protected tableDeleteDialogVisible = false;
  protected tableDeleteCodeDialogVisible = false;
  protected selectedTableForDelete: WorkspaceTableCard | null = null;
  protected tableDeleteCode = '';
  protected deletingTable = false;
  protected tableDeleteError: string | null = null;
  protected formError: string | null = null;
  protected employeeForm: EmployeeForm = this.createEmptyEmployeeForm();
  protected editingEmployeeId: number | null = null;
  protected selectedSettingsTab: SettingsTabId = 'account';
  protected readonly ownerSettingsTabs: SettingsTab[] = [
    { id: 'account', label: 'Аккаунт', icon: 'pi pi-user' },
    { id: 'appearance', label: 'Оформление', icon: 'pi pi-palette' },
  ];
  protected readonly staffSettingsTabs: SettingsTab[] = [
    { id: 'account', label: 'Аккаунт', icon: 'pi pi-user' },
    { id: 'appearance', label: 'Оформление', icon: 'pi pi-palette' },
  ];
  protected accountForm: AccountForm = {
    fullName: '',
    login: '',
    emailMasked: '',
    passwordMasked: '********',
  };
  protected notificationsSettings: NotificationSettings = {
    sources: { system: true, tables: true, employees: true },
    targets: { desktop: true, mobile: true, email: false },
  };
  protected appearanceSettings: AppearanceSettings = {
    theme: 'auto',
    density: 'comfortable',
    cardSize: 'medium',
  };
  protected settingsLoading = false;
  protected settingsError: string | null = null;
  protected settingsSaved = false;
  protected readonly subscriptionBonuses: SubscriptionBonus[] = [
    { key: 'extra_employee_seat', title: 'Доп места для сотрудников', price: 500, kind: 'quantity', unitLabel: 'чел', maxQty: 50 },
    { key: 'extra_directories', title: 'Доп справочники', price: 500, kind: 'quantity', unitLabel: 'шт', maxQty: 10 },
    { key: 'unlock_tasks', title: 'Открытие раздела "Задачи"', price: 2900, kind: 'toggle' },
    { key: 'unlock_analytics', title: 'Открытие раздела "Аналитика"', price: 4300, kind: 'toggle' },
    { key: 'unlock_employee_accounts', title: 'Открытие раздела "Аккаунты для сотрудников"', price: 1900, kind: 'toggle' },
    { key: 'order_history_audit_12m', title: 'История заказов и аудит на 12 мес', price: 990, kind: 'toggle' },
    { key: 'service_support', title: 'Поддержка от сервиса', price: 390, kind: 'toggle' },
    { key: 'table_customization', title: 'Кастомизация стола', price: 290, kind: 'toggle' },
  ];
  protected readonly promoCodes: Record<string, number> = {
    SMART5: 5,
    TABLE10: 10,
    BONUS15: 15,
  };
  protected tableSubscriptions: TableSubscription[] = [];
  protected readonly accountSubscriptionPlans: AccountSubscriptionPlan[] = [
    { key: 'account_analytics', title: 'Аналитика аккаунта', description: 'Доступ к аналитике для сотрудника', price: 890 },
    { key: 'account_tasks', title: 'Задачи аккаунта', description: 'Доступ к задачам и прогрессу стола', price: 590 },
  ];
  protected accountSubscriptionValues: Record<string, boolean> = {
    account_analytics: false,
    account_tasks: false,
  };
  protected readonly self = this;

  ngOnInit(): void {
    const section = this.route.snapshot.queryParamMap.get('section');
    if (
      section === 'tables' ||
      section === 'employees' ||
      section === 'analytics' ||
      section === 'settings' ||
      section === 'subscription'
    ) {
      this.selectedCategory = section as SidebarCategoryId;
    }
    this.load();
    this.startLiveRefresh();
  }

  ngOnDestroy(): void {
    this.stopLiveRefresh();
  }

  protected load(): void {
    this.loading = true;
    this.error = null;
    this.user = null;

    this.auth.me().subscribe({
      next: (u) => {
        this.user = u;
        this.loadSettings();
        this.loadOwnerTables();
        this.loadNotifications();
        this.loadAuditEvents();
        if (u.role === 'owner') {
          this.loadOwnerEmployees();
          this.loadEmployeeTableBindings();
        } else {
          this.loadStaffDetachStatuses();
        }
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        if (err?.status === 401) {
          // 401 обрабатывается глобально интерсептором редиректом на логин.
          return;
        }
        this.error = 'Не удалось загрузить данные. Попробуйте ещё раз.';
      },
    });
  }

  protected logout(): void {
    this.auth.logout();
  }

  protected selectCategory(categoryId: SidebarCategoryId): void {
    if (categoryId === 'logout') {
      this.logoutConfirmVisible = true;
      return;
    }
    this.selectedCategory = categoryId;
  }

  protected onSidebarCategorySelect(categoryId: string): void {
    const matched = this.categories.find((item) => item.id === categoryId);
    if (!matched) {
      return;
    }
    this.selectCategory(matched.id);
  }

  protected openNotifications(): void {
    this.notificationsDialogVisible = true;
    this.loadNotifications();
    if (!this.isOwner) {
      this.loadStaffDetachStatuses();
    }
  }

  protected markNotificationRead(notificationId: number): void {
    this.auth.markNotificationsRead([notificationId]).subscribe({
      next: () => {
        this.notifications = this.notifications.map((item) => (item.id === notificationId ? { ...item, isRead: true } : item));
        this.unreadNotifications = Math.max(
          this.notifications.reduce((sum, item) => sum + (item.isRead ? 0 : 1), 0),
          0,
        );
        this.recomputeStaffDetachStatuses();
        if (!this.isOwner) {
          this.loadStaffDetachStatuses();
        }
      },
    });
  }

  protected markAllNotificationsRead(): void {
    this.auth.markNotificationsRead([]).subscribe({
      next: () => {
        this.notifications = this.notifications.map((item) => ({ ...item, isRead: true }));
        this.unreadNotifications = 0;
        this.recomputeStaffDetachStatuses();
        if (!this.isOwner) {
          this.loadStaffDetachStatuses();
        }
      },
    });
  }

  protected openNotificationAction(notificationId: number): void {
    if (!this.isOwner) {
      return;
    }
    const notification = this.notifications.find((item) => item.id === notificationId);
    if (!notification) {
      return;
    }
    const requestId = this.extractDetachRequestId(notification.payload);
    if (!requestId) {
      return;
    }
    this.ownerDetachLoading = true;
    this.ownerDetachError = null;
    this.auth.getDetachRequest(requestId).subscribe({
      next: (request) => {
        this.ownerDetachLoading = false;
        this.ownerDetachRequest = this.mapDetachRequestDto(request);
        this.ownerDetachDialogVisible = true;
      },
      error: (err) => {
        this.ownerDetachLoading = false;
        this.ownerDetachError = err?.error?.detail || 'Не удалось открыть заявку.';
      },
    });
  }

  protected closeOwnerDetachDialog(): void {
    this.ownerDetachDialogVisible = false;
    this.ownerDetachError = null;
    this.ownerDetachLoading = false;
  }

  protected approveOwnerDetachRequest(): void {
    const requestId = this.ownerDetachRequest?.id;
    if (!requestId) {
      return;
    }
    this.ownerDetachLoading = true;
    this.ownerDetachError = null;
    this.auth.approveDetachRequest(requestId).subscribe({
      next: () => {
        this.ownerDetachLoading = false;
        this.ownerDetachDialogVisible = false;
        this.ownerDetachRequest = null;
        this.loadOwnerTables();
        this.loadNotifications();
      },
      error: (err) => {
        this.ownerDetachLoading = false;
        this.ownerDetachError = err?.error?.detail || 'Не удалось открепить сотрудника.';
      },
    });
  }

  protected get isOwner(): boolean {
    return this.user?.role === 'owner';
  }

  protected get hasOwnerTables(): boolean {
    return this.ownerTables.length > 0;
  }

  protected get selectedCategoryLabel(): string {
    return this.categories.find((category) => category.id === this.selectedCategory)?.label ?? 'Раздел';
  }

  protected get sidebarCategories(): SidebarCategory[] {
    return this.isOwner ? this.categories : this.categories.filter((item) => item.id !== 'employees');
  }

  protected staffDetachStatusLabel(tableId: number): StaffDetachStatusLabel | null {
    return this.staffDetachStatusByTable[tableId] ?? null;
  }

  protected categoryBadge(categoryId: SidebarCategoryId): string | null {
    if (categoryId === 'tables') {
      return `${this.ownerTables.length}`;
    }
    if (categoryId === 'employees' && this.isOwner) {
      return `${this.ownerEmployees.length}`;
    }
    if (categoryId === 'analytics') {
      return `${this.analyticsTables.length}`;
    }
    return null;
  }

  protected sidebarBadges(): Record<string, string> {
    const result: Record<string, string> = {};
    this.sidebarCategories.forEach((category) => {
      const badge = this.categoryBadge(category.id);
      if (badge) {
        result[category.id] = badge;
      }
    });
    return result;
  }

  protected inviteTableOptions(): Array<{ id: number; title: string }> {
    return this.ownerTables.map((table) => ({ id: table.id, title: table.title }));
  }

  protected get hasOwnerEmployees(): boolean {
    return this.ownerEmployees.length > 0;
  }

  protected get hasAnalyticsTables(): boolean {
    return this.analyticsTables.length > 0;
  }

  protected get settingsTabs(): SettingsTab[] {
    return this.isOwner ? this.ownerSettingsTabs : this.staffSettingsTabs;
  }

  protected getTaskProgress(taskStats: WorkspaceTableCard['stats']): number {
    const total = taskStats.tasksDone + taskStats.tasksWaiting + taskStats.tasksNew;
    if (total === 0) {
      return 0;
    }
    return Math.round((taskStats.tasksDone / total) * 100);
  }

  protected totalActiveEmployees(): number {
    return this.ownerTables.reduce((sum, table) => sum + table.stats.activeEmployees, 0);
  }

  protected totalQueuedOrders(): number {
    return this.ownerTables.reduce((sum, table) => sum + table.stats.queuedOrders, 0);
  }

  protected totalNewTasks(): number {
    return this.ownerTables.reduce((sum, table) => sum + table.stats.tasksNew, 0);
  }

  protected openCreateEmployeeDialog(): void {
    this.employeeDialogMode = 'create';
    this.editingEmployeeId = null;
    this.formError = null;
    this.employeeForm = this.createEmptyEmployeeForm();
    this.employeeDialogVisible = true;
  }

  protected openEditEmployeeDialog(employee: EmployeeCard): void {
    this.employeeDialogMode = 'edit';
    this.editingEmployeeId = employee.id;
    this.formError = null;
    this.employeeForm = {
      lastName: employee.lastName,
      firstName: employee.firstName,
      middleName: employee.middleName ?? '',
      birthDate: employee.birthDate,
      phone: employee.phone,
      email: employee.email ?? '',
      position: employee.position,
      note: employee.note ?? '',
      avatarDataUrl: employee.avatarDataUrl ?? '',
    };
    this.employeeDialogVisible = true;
  }

  protected submitEmployeeForm(): void {
    this.formError = this.validateEmployeeForm(this.employeeForm);
    if (this.formError) {
      return;
    }
    const request$ =
      this.employeeDialogMode === 'edit' && this.editingEmployeeId
        ? this.auth.updateEmployee(this.editingEmployeeId, {
            last_name: this.employeeForm.lastName.trim(),
            first_name: this.employeeForm.firstName.trim(),
            middle_name: this.employeeForm.middleName.trim() || null,
            birth_date: this.employeeForm.birthDate,
            phone: this.employeeForm.phone.trim(),
            position: this.employeeForm.position.trim(),
            note: this.employeeForm.note.trim() || null,
          })
        : this.auth.createEmployee({
            last_name: this.employeeForm.lastName.trim(),
            first_name: this.employeeForm.firstName.trim(),
            middle_name: this.employeeForm.middleName.trim() || null,
            birth_date: this.employeeForm.birthDate,
            phone: this.employeeForm.phone.trim(),
            email: this.employeeForm.email.trim() || null,
            position: this.employeeForm.position.trim(),
            note: this.employeeForm.note.trim() || null,
          });

    request$.subscribe({
        next: (employee) => {
          const mapped = this.mapEmployeeDto(employee);
          if (this.employeeDialogMode === 'edit' && this.editingEmployeeId) {
            this.ownerEmployees = this.ownerEmployees.map((item) => (item.id === this.editingEmployeeId ? mapped : item));
          } else {
            this.ownerEmployees = [mapped, ...this.ownerEmployees];
          }
          this.employeeDialogVisible = false;
          this.formError = null;
          this.employeeForm = this.createEmptyEmployeeForm();
          this.editingEmployeeId = null;
        },
        error: (err) => {
          this.formError = err?.error?.detail || 'Не удалось создать сотрудника.';
        },
      });
  }

  protected detachEmployee(employeeId: number): void {
    this.auth.detachEmployee(employeeId).subscribe({
      next: () => {
        this.ownerEmployees = this.ownerEmployees.filter((employee) => employee.id !== employeeId);
        delete this.employeeTableSelections[employeeId];
        delete this.employeeTableEditMode[employeeId];
        delete this.employeeTableBindingMessage[employeeId];
        this.detachedEmployeesCount += 1;
      },
    });
  }

  protected toggleEmployeeTableBindingEdit(employeeId: number): void {
    this.employeeTableEditMode[employeeId] = !this.employeeTableEditMode[employeeId];
    this.employeeTableBindingMessage[employeeId] = null;
  }

  protected onEmployeeTablesSelectChange(employeeId: number, event: Event): void {
    const target = event.target as HTMLSelectElement;
    const values = Array.from(target.selectedOptions).map((option) => Number(option.value));
    this.employeeTableSelections[employeeId] = values.filter((value) => !Number.isNaN(value));
  }

  protected saveEmployeeTableBindings(employeeId: number): void {
    const selectedIds = this.employeeTableSelections[employeeId] ?? [];
    this.auth.updateEmployeeTableBindings(employeeId, selectedIds).subscribe({
      next: (result) => {
        this.employeeTableSelections[employeeId] = [...result.table_ids];
        this.employeeTableBindingMessage[employeeId] = 'Привязка столов обновлена';
        this.employeeTableEditMode[employeeId] = false;
        this.loadOwnerTables();
      },
      error: () => {
        this.employeeTableBindingMessage[employeeId] = 'Не удалось обновить привязку';
      },
    });
  }

  protected onAvatarFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.employeeForm.avatarDataUrl = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.readAsDataURL(file);
  }

  protected clearAvatar(): void {
    this.employeeForm.avatarDataUrl = '';
  }

  protected showInviteDialog(): void {
    if (!this.ownerTables.length) {
      this.formError = 'Сначала создайте стол для приглашения.';
      return;
    }
    this.inviteDialogVisible = true;
    this.inviteGenerating = false;
    this.inviteError = null;
    this.inviteCode = '';
    this.inviteLink = '';
    this.inviteType = 'link';
    this.inviteTableId = this.ownerTables[0]?.id ?? null;
  }

  protected generateInvite(): void {
    const tableId = this.inviteTableId;
    if (!tableId) {
      this.inviteError = 'Выберите стол для приглашения.';
      return;
    }
    this.inviteGenerating = true;
    this.inviteError = null;
    this.inviteCode = '';
    this.inviteLink = '';
    this.auth.createTableInvite(tableId).subscribe({
      next: (resp) => {
        this.inviteGenerating = false;
        this.inviteCode = resp.code;
        this.inviteLink = `${window.location.origin}/auth/invite-register?code=${encodeURIComponent(resp.code)}`;
      },
      error: (err) => {
        this.inviteGenerating = false;
        this.inviteError = err?.error?.detail || 'Не удалось создать приглашение.';
      },
    });
  }

  protected openJoinTableDialog(): void {
    this.joinDialogVisible = true;
    this.resetJoinDialogState();
  }

  protected previewInviteCode(): void {
    const code = this.extractInviteCode(this.joinCode);
    if (!code || code.length < 8) {
      this.joinError = 'Введите корректный код или ссылку приглашения.';
      this.joinPreview = null;
      return;
    }
    this.joinCode = code;
    this.joinPreviewLoading = true;
    this.joinError = null;
    this.joinSuccess = null;
    this.auth.inviteInfo(code).subscribe({
      next: (info) => {
        this.joinPreviewLoading = false;
        this.joinPreview = this.mapJoinPreview(info);
      },
      error: (err) => {
        this.joinPreviewLoading = false;
        this.joinPreview = null;
        this.joinError = err?.error?.detail || 'Не удалось проверить код приглашения.';
      },
    });
  }

  protected confirmJoinByCode(): void {
    const code = this.extractInviteCode(this.joinCode);
    if (!this.joinPreview) {
      this.joinError = 'Сначала проверьте код приглашения.';
      return;
    }
    if (!code || code.length < 8) {
      this.joinError = 'Введите корректный код или ссылку приглашения.';
      return;
    }
    this.joinCode = code;
    this.joinLoading = true;
    this.joinError = null;
    this.joinSuccess = null;
    this.auth.acceptTableInvite(code).subscribe({
      next: () => {
        this.joinLoading = false;
        this.joinSuccess = 'Вы успешно присоединились к столу.';
        this.loadOwnerTables();
        this.loadNotifications();
        this.joinDialogVisible = false;
        this.resetJoinDialogState();
      },
      error: (err) => {
        this.joinLoading = false;
        this.joinError = err?.error?.detail || 'Не удалось присоединиться к столу.';
      },
    });
  }

  protected acceptInviteAsStaff(): void {
    const code = this.staffInviteCode.trim();
    if (!code) {
      this.staffInviteMessage = 'Введите код приглашения.';
      return;
    }
    this.auth.acceptTableInvite(code).subscribe({
      next: () => {
        this.staffInviteMessage = 'Приглашение принято. Вы привязаны к владельцу.';
      },
      error: (err) => {
        this.staffInviteMessage = err?.error?.detail || 'Не удалось принять приглашение.';
      },
    });
  }

  protected resetJoinDialogState(): void {
    this.joinCode = '';
    this.joinPreview = null;
    this.joinError = null;
    this.joinSuccess = null;
    this.joinLoading = false;
    this.joinPreviewLoading = false;
  }

  private extractInviteCode(raw: string): string {
    const value = raw.trim();
    if (!value) {
      return '';
    }
    if (!value.includes('://') && !value.includes('?')) {
      return value;
    }
    try {
      const parsed = new URL(value);
      return (parsed.searchParams.get('code') ?? '').trim() || value;
    } catch {
      const queryMatch = /[?&]code=([^&]+)/i.exec(value);
      if (!queryMatch) {
        return value;
      }
      try {
        return decodeURIComponent(queryMatch[1]).trim();
      } catch {
        return queryMatch[1].trim();
      }
    }
  }

  protected toggleTableMenu(tableId: number): void {
    this.openedTableMenuId = this.openedTableMenuId === tableId ? null : tableId;
  }

  protected isTableMenuOpen(tableId: number): boolean {
    return this.openedTableMenuId === tableId;
  }

  protected ownerCanOpenTasks(tableId: number): boolean {
    return (this.getTableSubscription(tableId).values['unlock_tasks'] ?? 0) > 0;
  }

  protected ownerCanOpenAnalytics(tableId: number): boolean {
    return (this.getTableSubscription(tableId).values['unlock_analytics'] ?? 0) > 0;
  }

  protected requestDetachFromTable(tableId: number): void {
    this.staffDetachTableId = tableId;
    this.staffDetachReason = '';
    this.staffDetachError = null;
    this.staffDetachLoading = false;
    this.staffDetachDialogVisible = true;
    this.openedTableMenuId = null;
  }

  protected submitDetachRequest(): void {
    if (!this.staffDetachTableId) {
      return;
    }
    const reason = this.staffDetachReason.trim();
    if (reason.length < 5) {
      this.staffDetachError = 'Укажите причину (минимум 5 символов).';
      return;
    }
    this.staffDetachLoading = true;
    this.staffDetachError = null;
    this.auth.requestDetachFromTable(this.staffDetachTableId, reason).subscribe({
      next: () => {
        const submittedTableId = this.staffDetachTableId;
        this.staffDetachLoading = false;
        this.staffInviteMessage = `Заявка на открепление от стола #${this.staffDetachTableId} отправлена владельцу.`;
        if (submittedTableId !== null) {
          this.staffDetachStatusByTable[submittedTableId] = 'Отправлено';
        }
        this.staffDetachDialogVisible = false;
        this.staffDetachReason = '';
        this.staffDetachTableId = null;
        this.loadNotifications();
        this.loadStaffDetachStatuses();
      },
      error: (err) => {
        this.staffDetachLoading = false;
        this.staffDetachError = err?.error?.detail || 'Не удалось отправить заявку на открепление.';
      },
    });
  }

  protected openTableSettings(tableId: number): void {
    const table = this.ownerTables.find((item) => item.id === tableId);
    if (!table) return;
    this.staffInviteMessage = `Просмотр настроек стола: ${table.title}`;
    this.openedTableMenuId = null;
  }

  protected openDeleteTableDialog(tableId: number): void {
    const table = this.ownerTables.find((item) => item.id === tableId);
    if (!table) {
      return;
    }
    this.selectedTableForDelete = table;
    this.tableDeleteDialogVisible = true;
    this.tableDeleteCodeDialogVisible = false;
    this.tableDeleteCode = '';
    this.tableDeleteError = null;
    this.openedTableMenuId = null;
  }

  protected requestDeleteTableCode(): void {
    if (!this.selectedTableForDelete) {
      return;
    }
    this.deletingTable = true;
    this.tableDeleteError = null;
    this.auth.requestDeleteTableCode(this.selectedTableForDelete.id).subscribe({
      next: () => {
        this.deletingTable = false;
        this.tableDeleteCodeDialogVisible = true;
      },
      error: (err) => {
        this.deletingTable = false;
        this.tableDeleteError = err?.error?.detail || 'Не удалось отправить код подтверждения удаления.';
      },
    });
  }

  protected confirmDeleteTableByCode(): void {
    const code = this.tableDeleteCode.trim();
    if (code.length < 4) {
      this.tableDeleteError = 'Введите код подтверждения.';
      return;
    }
    if (!this.selectedTableForDelete) {
      return;
    }
    this.deletingTable = true;
    this.tableDeleteError = null;
    this.auth.confirmDeleteTable(this.selectedTableForDelete.id, code).subscribe({
      next: () => {
        const deletedTableId = this.selectedTableForDelete?.id ?? null;
        this.ownerTables = this.ownerTables.filter((table) => table.id !== deletedTableId);
        this.analyticsTables = this.analyticsTables.filter((table) => table.tableId !== deletedTableId);
        this.tableSubscriptions = this.tableSubscriptions.filter((sub) => sub.tableId !== deletedTableId);
        this.selectedTableForDelete = null;
        this.tableDeleteDialogVisible = false;
        this.tableDeleteCodeDialogVisible = false;
        this.tableDeleteCode = '';
        this.deletingTable = false;
        if (this.analyticsSelectedTableId === deletedTableId) {
          this.analyticsSelectedTableId = this.analyticsTables[0]?.tableId ?? null;
        }
      },
      error: (err) => {
        this.deletingTable = false;
        this.tableDeleteError = err?.error?.detail || 'Не удалось удалить стол.';
      },
    });
  }

  protected closeDeleteTableDialog(): void {
    this.tableDeleteDialogVisible = false;
    this.tableDeleteCodeDialogVisible = false;
    this.selectedTableForDelete = null;
    this.tableDeleteCode = '';
    this.tableDeleteError = null;
    this.deletingTable = false;
  }

  protected openTableMembers(tableId: number): void {
    const table = this.ownerTables.find((item) => item.id === tableId);
    if (!table) return;
    this.selectedTableForMembers = table;
    this.tableMembersActionError = null;
    this.tableMembersDialogVisible = true;
    this.openedTableMenuId = null;
  }

  protected addEmployeeToSelectedTable(employeeId: number): void {
    if (!this.selectedTableForMembers) return;
    this.tableMembersActionError = null;
    this.auth.addTableMember(this.selectedTableForMembers.id, employeeId).subscribe({
      next: () => {
        this.loadOwnerTables();
        this.tableMembersDialogVisible = false;
      },
      error: (err) => {
        this.tableMembersActionError = err?.error?.detail || 'Не удалось добавить сотрудника в стол.';
      },
    });
  }

  protected goTableWorkspace(
    tableId: number,
    tab: 'calendar' | 'tasks' | 'directories' | 'analytics' | 'settings' = 'calendar',
  ): void {
    void this.router.navigate(['/workspace/table', tableId, tab]);
    this.openedTableMenuId = null;
  }

  protected openTableTasks(tableId: number): void {
    this.goTableWorkspace(tableId, 'tasks');
  }

  protected openTableAnalytics(tableId: number): void {
    this.goTableWorkspace(tableId, 'analytics');
  }

  protected openSubscriptionForBonus(tableId: number, bonusKey: string): void {
    const sub = this.getTableSubscription(tableId);
    if ((sub.values[bonusKey] ?? 0) <= 0) {
      sub.values[bonusKey] = 1;
      this.recalcPromo(sub);
      this.persistTableSubscription(tableId);
    }
    this.selectedCategory = 'subscription';
    this.openedTableMenuId = null;
  }

  protected accountSubscriptionEnabled(key: string): boolean {
    return this.accountSubscriptionValues[key] === true;
  }

  protected setAccountSubscriptionEnabled(key: string, enabled: boolean): void {
    this.accountSubscriptionValues[key] = enabled;
  }

  protected accountSubscriptionMonthlyTotal(): number {
    return this.accountSubscriptionPlans.reduce((sum, item) => sum + (this.accountSubscriptionValues[item.key] ? item.price : 0), 0);
  }

  protected hasStaffAnalyticsAccess(): boolean {
    return this.accountSubscriptionValues['account_analytics'] === true;
  }

  protected openStaffAnalyticsSubscription(): void {
    this.selectedCategory = 'subscription';
  }

  protected openCreateTableDialog(): void {
    this.tableFormError = null;
    this.tableCreateCode = '';
    this.tableCodeDialogVisible = false;
    this.tableForm = this.createEmptyTableForm();
    this.tableCreateStep = 1;
    this.tableDialogVisible = true;
  }

  protected goToTableCreateStep(step: number): void {
    if (step < 1 || step > 6) {
      return;
    }
    if (step > this.tableCreateStep) {
      for (let index = this.tableCreateStep; index < step; index += 1) {
        const error = this.validateTableStep(index);
        if (error) {
          this.tableFormError = error;
          return;
        }
      }
    }
    this.tableFormError = null;
    this.tableCreateStep = step;
  }

  protected nextTableCreateStep(): void {
    this.goToTableCreateStep(this.tableCreateStep + 1);
  }

  protected prevTableCreateStep(): void {
    this.goToTableCreateStep(this.tableCreateStep - 1);
  }

  protected selectedCreateEmployees(): EmployeeCard[] {
    return this.ownerEmployees.filter((employee) => this.tableForm.selectedEmployeeIds.includes(employee.id));
  }

  protected createEmployeeInitials(employee: EmployeeCard): string {
    const last = employee.lastName?.[0] ?? '';
    const first = employee.firstName?.[0] ?? '';
    return `${last}${first}`.toUpperCase();
  }

  protected presetDescription(preset: TableCreateForm['preset']): string {
    if (preset === 'barbershop') {
      return 'Календарь мастеров, очередь, повторные записи и смены для барбершопа.';
    }
    if (preset === 'grooming') {
      return 'Карточки питомцев, интервалы обслуживания, напоминания и контроль загрузки.';
    }
    return 'Собственный сценарий: настройка структуры стола под ваш бизнес-процесс.';
  }

  protected createFormSelectedBonusesCount(): number {
    return this.subscriptionBonuses.filter((bonus) => (this.tableForm.bonusValues[bonus.key] ?? 0) > 0).length;
  }

  protected submitCreateTable(): void {
    const validationError =
      this.validateTableStep(1) ??
      this.validateTableStep(2) ??
      this.validateTableStep(3) ??
      this.validateTableStep(4) ??
      this.validateTableStep(5);
    if (validationError) {
      this.tableFormError = validationError;
      return;
    }
    const title = this.tableForm.title.trim();

    const selectedBonusKeys = this.subscriptionBonuses
      .filter((bonus) => {
        const value = this.tableForm.bonusValues[bonus.key] ?? 0;
        return value > 0;
      })
      .map((bonus) => bonus.key);

    this.creatingTable = true;
    this.tableFormError = null;
    this.auth
      .requestCreateTableCode({
        title,
        description: this.tableForm.description.trim() || null,
        preset: this.tableForm.preset,
        custom_preset_name: this.tableForm.preset === 'custom' ? this.tableForm.customPresetName.trim() : null,
        selected_employee_ids: [...this.tableForm.selectedEmployeeIds],
        bonus_keys: selectedBonusKeys,
        time_format: this.tableForm.timeFormat,
        week_start_day: this.tableForm.weekStartDay,
        work_hours: `${this.tableForm.workDayStart}-${this.tableForm.workDayEnd}`,
      })
      .subscribe({
        next: () => {
          this.creatingTable = false;
          this.tableCodeDialogVisible = true;
        },
        error: (err) => {
          this.creatingTable = false;
          this.tableFormError = err?.error?.detail || 'Не удалось создать стол.';
        },
      });
  }

  protected confirmCreateTableByCode(): void {
    const code = this.tableCreateCode.trim();
    if (code.length < 4) {
      this.tableFormError = 'Введите код подтверждения.';
      return;
    }
    this.creatingTable = true;
    this.tableFormError = null;
    this.auth.confirmCreateTable(code).subscribe({
      next: (table) => {
        this.ownerTables = [this.mapTableDto(table), ...this.ownerTables];
        this.syncTableSubscriptions();
        this.loadTableSubscriptions();
        this.creatingTable = false;
        this.tableCodeDialogVisible = false;
        this.tableDialogVisible = false;
        this.tableForm = this.createEmptyTableForm();
        this.tableCreateCode = '';
      },
      error: (err) => {
        this.creatingTable = false;
        this.tableFormError = err?.error?.detail || 'Не удалось подтвердить код.';
      },
    });
  }

  protected toggleTableEmployee(employeeId: number, checked: boolean): void {
    if (checked) {
      if (!this.tableForm.selectedEmployeeIds.includes(employeeId)) {
        this.tableForm.selectedEmployeeIds = [...this.tableForm.selectedEmployeeIds, employeeId];
      }
      return;
    }
    this.tableForm.selectedEmployeeIds = this.tableForm.selectedEmployeeIds.filter((id) => id !== employeeId);
  }

  protected tableBonusValue(bonusKey: string): number {
    return this.tableForm.bonusValues[bonusKey] ?? 0;
  }

  protected setTableBonusToggle(bonusKey: string, enabled: boolean): void {
    this.tableForm.bonusValues[bonusKey] = enabled ? 1 : 0;
  }

  protected changeTableBonusQuantity(bonusKey: string, delta: number, maxQty: number): void {
    const current = this.tableForm.bonusValues[bonusKey] ?? 0;
    const next = Math.min(Math.max(current + delta, 0), maxQty);
    this.tableForm.bonusValues[bonusKey] = next;
  }

  protected createFormBonusMonthlyTotal(): number {
    return this.subscriptionBonuses.reduce((sum, bonus) => sum + (this.tableForm.bonusValues[bonus.key] ?? 0) * bonus.price, 0);
  }

  protected isTempCredentialsActive(expiresAtIso: string): boolean {
    return new Date(expiresAtIso).getTime() > Date.now();
  }

  protected formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('ru-RU');
  }

  protected chartMax(values: number[]): number {
    return Math.max(...values, 1);
  }

  protected chartAverage(values: number[]): number {
    const total = values.reduce((sum, value) => sum + value, 0);
    return Math.round((total / values.length) * 10) / 10;
  }

  protected analyticsAccessibleTables(): TableAnalytics[] {
    if (!this.isOwner) {
      return this.analyticsTables;
    }
    return this.analyticsTables.filter((table) => this.hasAnalyticsAccess(table.tableId));
  }

  protected selectedAnalyticsTable(): TableAnalytics | null {
    const tables = this.analyticsAccessibleTables();
    if (tables.length === 0) {
      return null;
    }
    const selected = tables.find((table) => table.tableId === this.analyticsSelectedTableId);
    return selected ?? tables[0];
  }

  protected selectAnalyticsTable(tableId: number): void {
    this.analyticsSelectedTableId = tableId;
    this.analyticsDrilldownChartTitle = null;
  }

  protected selectAnalyticsPeriod(period: AnalyticsPeriod): void {
    this.analyticsPeriod = period;
  }

  protected toggleAnalyticsCompareMode(enabled: boolean): void {
    this.analyticsCompareWithPrevious = enabled;
  }

  protected selectAnalyticsKpi(kpi: AnalyticsKpiKey): void {
    this.analyticsSelectedKpi = kpi;
  }

  protected analyticsPeriodLabel(): string {
    return this.analyticsPeriods.find((item) => item.id === this.analyticsPeriod)?.label ?? '30 дней';
  }

  protected analyticsKpis(table: TableAnalytics | null): AnalyticsKpiCard[] {
    if (!table) {
      return [];
    }
    if (table.kpis.length > 0) {
      return table.kpis.slice(0, 4).map((kpi, idx) => ({
        key: (['overview', 'employees', 'workload', 'tasks'][idx] ?? 'overview') as AnalyticsKpiKey,
        title: kpi.title,
        value: `${this.formatMetric(kpi.value)}${kpi.unit ? ` ${kpi.unit}` : ''}`,
        delta: this.formatSignedPercent(kpi.deltaPercent ?? 0),
      }));
    }
    const summary = this.analyticsSummary(table);
    return [
      { key: 'overview', title: 'Среднее значение', value: `${summary.avgValue}`, delta: this.formatSignedPercent(summary.deltaPercent) },
      { key: 'employees', title: 'Активные сотрудники', value: `${table.activeEmployees}`, delta: '0%' },
      { key: 'workload', title: 'Очередь заказов', value: `${table.queuedOrders}`, delta: '0%' },
      { key: 'tasks', title: 'Пиковое значение', value: `${summary.peakValue}`, delta: '0%' },
    ];
  }

  protected analyticsTrendData(table: TableAnalytics | null): unknown {
    if (!table) {
      return { labels: [], datasets: [] };
    }
    const primary = this.analyticsPrimaryChart(table);
    const values = this.limitByPeriod(primary.values);
    return {
      labels: this.analyticsLabels(values.length),
      datasets: [
        {
          label: primary.title,
          data: values,
          tension: 0.35,
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.16)',
          fill: true,
        },
      ],
    };
  }

  protected analyticsDistributionData(table: TableAnalytics | null): unknown {
    if (!table) {
      return { labels: [], datasets: [] };
    }
    const labels = table.segments.length ? table.segments.map((seg) => seg.label) : table.charts.map((chart) => chart.title);
    const values = table.segments.length
      ? table.segments.map((seg) => seg.value)
      : table.charts.map((chart) => this.chartAverage(this.limitByPeriod(chart.values)));
    return {
      labels,
      datasets: [
        {
          label: 'Средние значения',
          data: values,
          backgroundColor: ['#4f46e5', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'],
        },
      ],
    };
  }

  protected analyticsTrendOptions(): unknown {
    return {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true },
      },
    };
  }

  protected analyticsDistributionOptions(): unknown {
    return {
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { enabled: true },
      },
      scales: {
        y: { beginAtZero: true },
      },
    };
  }

  protected analyticsTableInsights(table: TableAnalytics | null): string[] {
    if (!table) {
      return [];
    }
    if (table.breakdown.length > 0) {
      return table.breakdown.slice(0, 4).map((row) => `${row.label}: ${this.formatMetric(row.value)}`);
    }
    const summary = this.analyticsSummary(table);
    const topChart = this.analyticsTopChart(table);
    return [
      `За ${this.analyticsPeriodLabel()} среднее значение: ${summary.avgValue}.`,
      `Пиковая активность: ${summary.peakValue}.`,
      `Сильнейшая категория: ${topChart.title} (${topChart.avg}).`,
      this.analyticsSelectedKpi === 'workload'
        ? `Текущая очередь: ${table.queuedOrders}. Рекомендуется контролировать нагрузку по сотрудникам.`
        : `Активных сотрудников: ${table.activeEmployees}. Рекомендуется сравнить пики по категориям.`,
    ];
  }

  protected openAnalyticsDrilldown(chartTitle: string): void {
    this.analyticsDrilldownChartTitle = chartTitle;
  }

  protected closeAnalyticsDrilldown(): void {
    this.analyticsDrilldownChartTitle = null;
  }

  protected analyticsDrilldownRows(table: TableAnalytics | null): Array<{ label: string; value: number }> {
    if (!table || !this.analyticsDrilldownChartTitle) {
      return [];
    }
    const chart = table.charts.find((item) => item.title === this.analyticsDrilldownChartTitle);
    if (!chart) {
      return [];
    }
    const values = this.limitByPeriod(chart.values);
    const periods = table.periods.map((item) => item.period);
    return values.map((value, index) => ({ label: periods[index] ?? `Точка ${index + 1}`, value }));
  }

  protected selectSettingsTab(tabId: SettingsTabId): void {
    this.selectedSettingsTab = tabId;
  }

  protected saveAccountSettings(): void {
    this.saveSettings();
  }

  protected saveAppearanceSettings(): void {
    this.saveSettings();
  }

  protected saveNotificationsSettings(): void {
    this.saveSettings();
  }

  protected requestEmailChange(): void {
    this.settingsSaved = false;
    this.settingsError = 'Смена email будет доступна отдельным шагом через подтверждение письмом.';
  }

  protected requestPasswordChange(): void {
    this.settingsSaved = false;
    this.settingsError = 'Смену пароля можно выполнить через экран "Забыли пароль?".';
  }

  protected confirmLogout(): void {
    this.logoutConfirmVisible = false;
    this.logout();
  }

  protected formatRub(value: number | null): string {
    if (value === null) {
      return 'по запросу';
    }
    return `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
  }

  protected get hasSubscriptionTables(): boolean {
    return this.ownerTables.length > 0;
  }

  protected getTableSubscription(tableId: number): TableSubscription {
    return (
      this.tableSubscriptions.find((item) => item.tableId === tableId) ?? {
        tableId,
        values: {},
        promoCode: '',
        promoError: null,
        appliedPromoPercent: 0,
      }
    );
  }

  protected bonusValue(tableId: number, bonusKey: string): number {
    return this.getTableSubscription(tableId).values[bonusKey] ?? 0;
  }

  protected setBonusToggle(tableId: number, bonusKey: string, enabled: boolean): void {
    const sub = this.getTableSubscription(tableId);
    sub.values[bonusKey] = enabled ? 1 : 0;
    this.recalcPromo(sub);
    this.persistTableSubscription(tableId);
  }

  protected changeBonusQuantity(tableId: number, bonusKey: string, next: number, maxQty: number): void {
    const sub = this.getTableSubscription(tableId);
    const safe = Math.min(Math.max(next, 0), maxQty);
    sub.values[bonusKey] = safe;
    this.recalcPromo(sub);
    this.persistTableSubscription(tableId);
  }

  protected applyPromo(tableId: number): void {
    const sub = this.getTableSubscription(tableId);
    const normalized = sub.promoCode.trim().toUpperCase();
    if (!normalized) {
      sub.appliedPromoPercent = 0;
      sub.promoError = null;
      return;
    }
    const percent = this.promoCodes[normalized];
    if (!percent) {
      sub.appliedPromoPercent = 0;
      sub.promoError = 'Промокод не найден';
      return;
    }
    sub.appliedPromoPercent = percent;
    sub.promoError = null;
  }

  protected setPromoCode(tableId: number, value: string): void {
    const sub = this.getTableSubscription(tableId);
    sub.promoCode = value;
    this.recalcPromo(sub);
  }

  protected selectedBonusesCount(tableId: number): number {
    const sub = this.getTableSubscription(tableId);
    return this.subscriptionBonuses.filter((bonus) => (sub.values[bonus.key] ?? 0) > 0).length;
  }

  protected tableSubtotal(tableId: number): number {
    const sub = this.getTableSubscription(tableId);
    return this.subscriptionBonuses.reduce((sum, bonus) => sum + (sub.values[bonus.key] ?? 0) * bonus.price, 0);
  }

  protected tableAutoDiscount(tableId: number): number {
    const subtotal = this.tableSubtotal(tableId);
    return this.selectedBonusesCount(tableId) > 3 ? Math.round(subtotal * 0.15) : 0;
  }

  protected tablePromoDiscount(tableId: number): number {
    const sub = this.getTableSubscription(tableId);
    if (!sub.appliedPromoPercent) {
      return 0;
    }
    const afterAuto = this.tableSubtotal(tableId) - this.tableAutoDiscount(tableId);
    return Math.round(afterAuto * (sub.appliedPromoPercent / 100));
  }

  protected tableMonthlyTotal(tableId: number): number {
    const subtotal = this.tableSubtotal(tableId);
    const total = subtotal - this.tableAutoDiscount(tableId) - this.tablePromoDiscount(tableId);
    return Math.max(total, 0);
  }

  protected activeBonusLabels(tableId: number): string[] {
    const sub = this.getTableSubscription(tableId);
    return this.subscriptionBonuses
      .filter((bonus) => (sub.values[bonus.key] ?? 0) > 0)
      .map((bonus) => {
        const qty = sub.values[bonus.key] ?? 0;
        return bonus.kind === 'quantity' ? `${bonus.title}: ${qty} ${bonus.unitLabel ?? 'шт'}` : bonus.title;
      });
  }

  protected hasAnalyticsAccess(tableId: number): boolean {
    return (this.getTableSubscription(tableId).values[this.analyticsBonusKey] ?? 0) > 0;
  }

  protected isFirstLockedAnalyticsTable(tableId: number): boolean {
    const firstLocked = this.analyticsTables.find((table) => !this.hasAnalyticsAccess(table.tableId));
    return firstLocked?.tableId === tableId;
  }

  protected analyticsUnlockMonthlyAmount(tableId: number): number {
    const sub = this.getTableSubscription(tableId);
    if ((sub.values[this.analyticsBonusKey] ?? 0) > 0) {
      return 0;
    }
    const values: Record<string, number> = { ...sub.values, [this.analyticsBonusKey]: 1 };
    return this.monthlyTotalByValues(values, sub.appliedPromoPercent);
  }

  protected goToSubscriptionForAnalytics(tableId: number): void {
    const sub = this.getTableSubscription(tableId);
    if ((sub.values[this.analyticsBonusKey] ?? 0) <= 0) {
      sub.values[this.analyticsBonusKey] = 1;
      this.recalcPromo(sub);
      this.persistTableSubscription(tableId);
    }
    this.selectedCategory = 'subscription';
  }

  private loadOwnerTables(): void {
    this.auth.myTables().subscribe({
      next: (tables) => {
        this.ownerTables = tables.map((table) => this.mapTableDto(table));
        this.syncTableSubscriptions();
        this.loadTableSubscriptions();
        this.loadAnalyticsTables();
      },
      error: () => {
        this.ownerTables = [];
        this.analyticsTables = [];
      },
    });
  }

  private loadOwnerEmployees(): void {
    this.auth.myEmployees().subscribe({
      next: (employees) => {
        this.ownerEmployees = employees.map((item) => this.mapEmployeeDto(item));
        this.ownerEmployees.forEach((employee) => {
          this.employeeTableSelections[employee.id] = this.employeeTableSelections[employee.id] ?? [];
          this.employeeTableEditMode[employee.id] = this.employeeTableEditMode[employee.id] ?? false;
          this.employeeTableBindingMessage[employee.id] = this.employeeTableBindingMessage[employee.id] ?? null;
        });
      },
      error: () => {
        this.ownerEmployees = [];
      },
    });
  }

  private loadEmployeeTableBindings(): void {
    this.auth.employeeTableBindings().subscribe({
      next: (items) => {
        const bindings: Record<number, number[]> = {};
        items.forEach((item) => {
          bindings[item.employee_id] = [...item.table_ids];
        });
        this.employeeTableSelections = { ...this.employeeTableSelections, ...bindings };
      },
      error: () => {
        // Ошибки привязок не должны ломать рендер списка сотрудников.
      },
    });
  }

  private loadSettings(): void {
    this.settingsLoading = true;
    this.settingsError = null;
    this.settingsSaved = false;
    this.auth.mySettings().subscribe({
      next: (settings) => {
        this.applySettingsDto(settings);
        this.settingsLoading = false;
      },
      error: () => {
        this.settingsLoading = false;
        this.settingsError = 'Не удалось загрузить настройки аккаунта.';
      },
    });
  }

  private saveSettings(): void {
    this.settingsLoading = true;
    this.settingsError = null;
    this.settingsSaved = false;

    this.auth
      .updateMySettings({
        appearance: {
          theme: this.appearanceSettings.theme,
          density: this.appearanceSettings.density,
          card_size: this.appearanceSettings.cardSize,
        },
        notifications: this.notificationsSettings as NotificationSettingsDto,
      })
      .subscribe({
        next: (settings) => {
          this.applySettingsDto(settings);
          this.settingsLoading = false;
          this.settingsSaved = true;
        },
        error: () => {
          this.settingsLoading = false;
          this.settingsError = 'Не удалось сохранить настройки.';
        },
      });
  }

  private applySettingsDto(settings: UserSettingsDto): void {
    const first = settings.account.first_name?.trim() ?? '';
    const last = settings.account.last_name?.trim() ?? '';
    this.accountForm = {
      fullName: `${last} ${first}`.trim() || this.user?.login || '',
      login: settings.account.login,
      emailMasked: settings.account.security.email_masked,
      passwordMasked: settings.account.security.password_masked,
    };
    this.appearanceSettings = {
      theme: settings.appearance.theme,
      density: settings.appearance.density,
      cardSize: settings.appearance.card_size,
    };
    this.themeService.applyTheme(this.appearanceSettings.theme);
    this.notificationsSettings = {
      sources: { ...settings.notifications.sources },
      targets: { ...settings.notifications.targets },
    };
  }

  private loadAnalyticsTables(): void {
    this.auth.myTablesAnalytics().subscribe({
      next: (tables) => {
        this.analyticsTables = tables.map((table) => this.mapAnalyticsDto(table));
        if (!this.analyticsSelectedTableId) {
          this.analyticsSelectedTableId = this.analyticsTables[0]?.tableId ?? null;
        }
      },
      error: () => {
        this.analyticsTables = [];
      },
    });
  }

  private loadNotifications(): void {
    this.notificationsLoading = true;
    this.notificationsError = null;
    this.auth.myNotifications(40, 0).subscribe({
      next: (resp) => {
        this.notifications = resp.items.map((item) => this.mapNotificationDto(item));
        this.unreadNotifications = resp.unread_count;
        this.recomputeStaffDetachStatuses();
        this.notificationsLoading = false;
      },
      error: () => {
        this.notificationsLoading = false;
        this.notificationsError = 'Не удалось загрузить уведомления.';
      },
    });
  }

  private loadStaffDetachStatuses(): void {
    if (this.isOwner) {
      this.staffDetachStatusByTable = {};
      return;
    }
    this.auth.myDetachRequestStatuses().subscribe({
      next: (rows) => {
        this.staffDetachStatusByTable = this.mapStaffDetachStatuses(rows);
      },
      error: () => {
        this.staffDetachStatusByTable = {};
      },
    });
  }

  private loadAuditEvents(): void {
    this.auth.myAuditEvents(50, 0).subscribe({
      next: (events) => {
        this.auditEvents = events.map((item) => ({
          id: item.id,
          action: item.action,
          status: item.status,
          createdAt: item.created_at,
        }));
      },
      error: () => {
        this.auditEvents = [];
      },
    });
  }

  private mapNotificationDto(item: UserNotificationDto): DashboardNotification {
    return {
      id: item.id,
      kind: item.kind,
      title: item.title,
      message: item.message,
      priority: item.priority ?? 'normal',
      isRead: item.is_read,
      createdAt: item.created_at,
      payload: item.payload ?? null,
    };
  }

  private extractDetachRequestId(payload: Record<string, unknown> | null | undefined): number | null {
    if (!payload) {
      return null;
    }
    const raw = payload['detach_request_id'];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }
    if (typeof raw === 'string') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  }

  private mapDetachRequestDto(request: DetachRequestDto): OwnerDetachRequestView {
    return {
      id: request.id,
      staffName: request.staff_short_name,
      staffLogin: request.staff_login,
      tableTitle: request.table_title,
      reason: request.reason,
      createdAt: request.created_at,
      status: request.status,
    };
  }

  private recomputeStaffDetachStatuses(): void {
    if (this.isOwner) {
      return;
    }
    if (Object.keys(this.staffDetachStatusByTable).length === 0) {
      return;
    }
    const next = { ...this.staffDetachStatusByTable };
    const sorted = [...this.notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    for (const item of sorted) {
      if (item.kind !== 'table.detach') {
        continue;
      }
      const tableId = this.extractTableId(item.payload);
      if (!tableId || !next[tableId]) {
        continue;
      }
      next[tableId] = item.isRead ? 'Прочитано' : 'Не прочитано';
    }
    this.staffDetachStatusByTable = next;
  }

  private extractTableId(payload: Record<string, unknown> | null | undefined): number | null {
    if (!payload) {
      return null;
    }
    const raw = payload['table_id'];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }
    if (typeof raw === 'string') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  }

  private mapStaffDetachStatuses(rows: DetachRequestStatusDto[]): Record<number, StaffDetachStatusLabel> {
    return rows.reduce<Record<number, StaffDetachStatusLabel>>((acc, row) => {
      acc[row.table_id] = row.status_label;
      return acc;
    }, {});
  }

  private startLiveRefresh(): void {
    this.stopLiveRefresh();
    this.liveRefreshTimerId = setInterval(() => {
      if (this.loading || !this.user) {
        return;
      }
      this.loadOwnerTables();
      this.loadNotifications();
      if (this.isOwner) {
        this.loadOwnerEmployees();
      } else {
        this.loadStaffDetachStatuses();
      }
    }, 10000);
  }

  private stopLiveRefresh(): void {
    if (this.liveRefreshTimerId === null) {
      return;
    }
    clearInterval(this.liveRefreshTimerId);
    this.liveRefreshTimerId = null;
  }

  private mapJoinPreview(info: InviteInfoDto): JoinInvitePreview {
    return {
      ownerShortName: info.owner_short_name,
      tableTitle: info.table_title ?? null,
      expiresAt: new Date(info.expires_at).toLocaleString('ru-RU'),
    };
  }

  private mapTableDto(table: TableDto): WorkspaceTableCard {
    return {
      id: table.id,
      title: table.title,
      totalParticipants: table.total_participants,
      ownerShortName: table.owner_short_name,
      stats: {
        activeEmployees: table.stats.active_employees,
        queuedOrders: table.stats.queued_orders,
        tasksDone: table.stats.tasks_done,
        tasksWaiting: table.stats.tasks_waiting,
        tasksNew: table.stats.tasks_new,
      },
    };
  }

  private mapAnalyticsDto(table: TableAnalyticsDto): TableAnalytics {
    return {
      tableId: table.table_id,
      tableName: table.table_name,
      participants: table.participants,
      activeEmployees: table.active_employees,
      queuedOrders: table.queued_orders,
      charts: table.charts.map((chart) => ({
        title: chart.title,
        subtitle: chart.subtitle,
        values: [...chart.values],
      })),
      kpis: (table.kpis ?? []).map((kpi) => ({
        key: kpi.key,
        title: kpi.title,
        value: kpi.value,
        unit: kpi.unit ?? null,
        deltaPercent: kpi.delta_percent ?? null,
      })),
      segments: table.segments ?? [],
      periods: table.periods ?? [],
      forecast: table.forecast ?? null,
      anomalies: table.anomalies ?? [],
      breakdown: table.breakdown ?? [],
    };
  }

  private limitByPeriod(values: number[]): number[] {
    const periodSize = this.analyticsPeriod === '7d' ? 7 : this.analyticsPeriod === '30d' ? 30 : this.analyticsPeriod === '90d' ? 90 : 365;
    if (values.length <= periodSize) {
      return values;
    }
    return values.slice(values.length - periodSize);
  }

  private analyticsPrimaryChart(table: TableAnalytics): AnalyticsMiniChart {
    return table.charts[0] ?? { title: 'Нет данных', subtitle: '', values: [] };
  }

  private analyticsTopChart(table: TableAnalytics): { title: string; avg: number } {
    if (table.charts.length === 0) {
      return { title: 'Нет данных', avg: 0 };
    }
    const withAverage = table.charts.map((chart) => ({
      title: chart.title,
      avg: this.chartAverage(this.limitByPeriod(chart.values)),
    }));
    return withAverage.sort((a, b) => b.avg - a.avg)[0];
  }

  private analyticsSummary(table: TableAnalytics): {
    avgValue: number;
    peakValue: number;
    deltaPercent: number;
    employeesDeltaPercent: number;
    queueDeltaPercent: number;
    peakDeltaPercent: number;
  } {
    const primaryValues = this.limitByPeriod(this.analyticsPrimaryChart(table).values);
    const avgValue = this.chartAverage(primaryValues);
    const peakValue = this.chartMax(primaryValues);
    const midpoint = Math.floor(primaryValues.length / 2);
    const previous = primaryValues.slice(0, midpoint);
    const current = primaryValues.slice(midpoint);
    const prevAvg = this.chartAverage(previous.length > 0 ? previous : [0]);
    const currAvg = this.chartAverage(current.length > 0 ? current : [0]);
    const deltaPercent = prevAvg === 0 ? 0 : Math.round(((currAvg - prevAvg) / prevAvg) * 100);
    return { avgValue, peakValue, deltaPercent, employeesDeltaPercent: 0, queueDeltaPercent: 0, peakDeltaPercent: 0 };
  }

  private analyticsLabels(length: number): string[] {
    return Array.from({ length }, (_, index) => `${index + 1}`);
  }

  private formatSignedPercent(value: number): string {
    if (value > 0) {
      return `+${value}%`;
    }
    if (value < 0) {
      return `${value}%`;
    }
    return '0%';
  }

  private formatMetric(value: number): string {
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(2);
  }

  private mapEmployeeDto(employee: EmployeeDto): EmployeeCard {
    return {
      id: employee.id,
      lastName: employee.last_name ?? '',
      firstName: employee.first_name ?? '',
      middleName: employee.middle_name ?? null,
      birthDate: employee.birth_date ?? '',
      phone: employee.phone ?? '',
      email: employee.email ?? null,
      position: employee.position ?? '',
      note: employee.note ?? null,
      avatarDataUrl: null,
      tempCredentials: employee.temp_credentials
        ? {
            login: employee.temp_credentials.login,
            password: employee.temp_credentials.password,
            expiresAt: employee.temp_credentials.expires_at,
          }
        : undefined,
    };
  }

  private syncTableSubscriptions(): void {
    const prev = new Map(this.tableSubscriptions.map((item) => [item.tableId, item]));
    this.tableSubscriptions = this.ownerTables.map((table) => {
      const existing = prev.get(table.id);
      return (
        existing ?? {
          tableId: table.id,
          values: {},
          promoCode: '',
          promoError: null,
          appliedPromoPercent: 0,
        }
      );
    });
  }

  private loadTableSubscriptions(): void {
    this.auth.myTableSubscriptions().subscribe({
      next: (items) => {
        const byTable = new Map(items.map((item) => [item.table_id, item.bonuses]));
        this.tableSubscriptions = this.tableSubscriptions.map((sub) => {
          const bonuses = byTable.get(sub.tableId) ?? [];
          const values = bonuses.reduce<Record<string, number>>((acc, bonus) => {
            acc[bonus.key] = bonus.qty;
            return acc;
          }, {});
          return { ...sub, values };
        });
      },
      error: () => {
        // Оставляем локальное состояние без прерывания UX.
      },
    });
  }

  private persistTableSubscription(tableId: number): void {
    const sub = this.tableSubscriptions.find((item) => item.tableId === tableId);
    if (!sub) {
      return;
    }
    const bonuses = Object.entries(sub.values)
      .filter(([, qty]) => qty > 0)
      .map(([key, qty]) => ({ key, qty }));
    this.auth.updateTableSubscription(tableId, { bonuses }).subscribe({
      error: () => {
        // В текущем UX тихо игнорируем сетевые ошибки сохранения.
      },
    });
  }

  private recalcPromo(sub: TableSubscription): void {
    if (!sub.promoCode.trim()) {
      sub.appliedPromoPercent = 0;
      sub.promoError = null;
      return;
    }
    const normalized = sub.promoCode.trim().toUpperCase();
    const percent = this.promoCodes[normalized] ?? 0;
    sub.appliedPromoPercent = percent;
    sub.promoError = percent ? null : 'Промокод не найден';
  }

  private monthlyTotalByValues(values: Record<string, number>, promoPercent: number): number {
    const subtotal = this.subscriptionBonuses.reduce((sum, bonus) => sum + (values[bonus.key] ?? 0) * bonus.price, 0);
    const selectedCount = this.subscriptionBonuses.filter((bonus) => (values[bonus.key] ?? 0) > 0).length;
    const autoDiscount = selectedCount > 3 ? Math.round(subtotal * 0.15) : 0;
    const promoDiscount = promoPercent > 0 ? Math.round((subtotal - autoDiscount) * (promoPercent / 100)) : 0;
    return Math.max(subtotal - autoDiscount - promoDiscount, 0);
  }

  private validateEmployeeForm(form: EmployeeForm): string | null {
    if (!form.lastName.trim()) {
      return 'Укажите фамилию.';
    }
    if (!form.firstName.trim()) {
      return 'Укажите имя.';
    }
    if (!form.birthDate) {
      return 'Укажите дату рождения.';
    }
    if (!this.isAgeAtLeast(form.birthDate, 16)) {
      return 'Сотруднику должно быть минимум 16 лет.';
    }
    if (!form.phone.trim()) {
      return 'Укажите номер телефона.';
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return 'Укажите корректный email.';
    }
    if (!form.position.trim()) {
      return 'Укажите должность.';
    }
    return null;
  }

  private isAgeAtLeast(dateIso: string, minAge: number): boolean {
    const birth = new Date(dateIso);
    if (Number.isNaN(birth.getTime())) {
      return false;
    }
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
      age -= 1;
    }
    return age >= minAge;
  }

  private createEmptyEmployeeForm(): EmployeeForm {
    return {
      lastName: '',
      firstName: '',
      middleName: '',
      birthDate: '',
      phone: '',
      email: '',
      position: '',
      note: '',
      avatarDataUrl: '',
    };
  }

  private createEmptyTableForm(): TableCreateForm {
    return {
      title: '',
      description: '',
      preset: 'barbershop',
      customPresetName: '',
      selectedEmployeeIds: [],
      bonusValues: {},
      timeFormat: 'us',
      weekStartDay: 'monday',
      workDayStart: '09:00',
      workDayEnd: '18:00',
    };
  }

  private validateTableStep(step: number): string | null {
    if (step === 1) {
      if (this.tableForm.title.trim().length < 2) {
        return 'Название стола должно быть не короче 2 символов.';
      }
      if (this.tableForm.description.trim().length > 0 && this.tableForm.description.trim().length < 10) {
        return 'Описание должно содержать минимум 10 символов.';
      }
      return null;
    }
    if (step === 2) {
      if (this.tableForm.preset === 'custom' && this.tableForm.customPresetName.trim().length < 2) {
        return 'Укажите название своей предустановки.';
      }
      return null;
    }
    if (step === 3) {
      if (!this.tableForm.workDayStart || !this.tableForm.workDayEnd) {
        return 'Укажите рабочие часы.';
      }
      if (this.tableForm.workDayStart >= this.tableForm.workDayEnd) {
        return 'Время окончания должно быть позже времени начала.';
      }
      return null;
    }
    return null;
  }

}

type SidebarCategoryId =
  | 'tables'
  | 'employees'
  | 'analytics'
  | 'settings'
  | 'subscription'
  | 'logout';

interface SidebarCategory {
  id: SidebarCategoryId;
  label: string;
  icon: string;
}

interface WorkspaceTableCard {
  id: number;
  title: string;
  totalParticipants: number;
  ownerShortName: string;
  stats: {
    activeEmployees: number;
    queuedOrders: number;
    tasksDone: number;
    tasksWaiting: number;
    tasksNew: number;
  };
}

interface TableCreateForm {
  title: string;
  description: string;
  preset: 'barbershop' | 'grooming' | 'custom';
  customPresetName: string;
  selectedEmployeeIds: number[];
  bonusValues: Record<string, number>;
  timeFormat: 'us' | 'eu';
  weekStartDay: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  workDayStart: string;
  workDayEnd: string;
}

interface TempCredentials {
  login: string;
  password: string;
  expiresAt: string;
}

interface EmployeeCard {
  id: number;
  lastName: string;
  firstName: string;
  middleName: string | null;
  birthDate: string;
  phone: string;
  email: string | null;
  position: string;
  note: string | null;
  avatarDataUrl: string | null;
  tempCredentials?: TempCredentials;
}

interface EmployeeForm {
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  phone: string;
  email: string;
  position: string;
  note: string;
  avatarDataUrl: string;
}

interface AnalyticsMiniChart {
  title: string;
  subtitle: string;
  values: number[];
}

interface TableAnalytics {
  tableId: number;
  tableName: string;
  participants: number;
  activeEmployees: number;
  queuedOrders: number;
  charts: AnalyticsMiniChart[];
  kpis: AnalyticsKpi[];
  periods: AnalyticsPeriodPoint[];
  segments: AnalyticsSegment[];
  forecast: AnalyticsForecast | null;
  anomalies: AnalyticsAnomaly[];
  breakdown: AnalyticsBreakdownRow[];
}

type AnalyticsPeriod = '7d' | '30d' | '90d' | '365d';

type AnalyticsKpiKey = 'overview' | 'employees' | 'workload' | 'tasks';

interface AnalyticsKpiCard {
  key: AnalyticsKpiKey;
  title: string;
  value: string;
  delta: string;
}

interface AnalyticsKpi {
  key: string;
  title: string;
  value: number;
  unit: string | null;
  deltaPercent: number | null;
}

interface AnalyticsPeriodPoint {
  period: string;
  values: number[];
}

interface AnalyticsSegment {
  key: string;
  label: string;
  value: number;
}

interface AnalyticsForecast {
  horizon: string;
  values: number[];
}

interface AnalyticsAnomaly {
  date: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
}

interface AnalyticsBreakdownRow {
  label: string;
  value: number;
}

type SettingsTabId = 'account' | 'appearance';

interface SettingsTab {
  id: SettingsTabId;
  label: string;
  icon: string;
}

interface AccountForm {
  fullName: string;
  login: string;
  emailMasked: string;
  passwordMasked: string;
}

interface AppearanceSettings {
  theme: 'light' | 'dark' | 'auto';
  density: 'compact' | 'comfortable';
  cardSize: 'small' | 'medium' | 'large';
}

interface NotificationSettings {
  sources: {
    system: boolean;
    tables: boolean;
    employees: boolean;
  };
  targets: {
    desktop: boolean;
    mobile: boolean;
    email: boolean;
  };
}

interface SubscriptionBonus {
  key: string;
  title: string;
  price: number;
  kind: 'quantity' | 'toggle';
  maxQty?: number;
  unitLabel?: string;
}

interface TableSubscription {
  tableId: number;
  values: Record<string, number>;
  promoCode: string;
  promoError: string | null;
  appliedPromoPercent: number;
}

interface AccountSubscriptionPlan {
  key: string;
  title: string;
  description: string;
  price: number;
}

interface JoinInvitePreview {
  ownerShortName: string;
  tableTitle: string | null;
  expiresAt: string;
}

interface DashboardNotification {
  id: number;
  kind: string;
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high';
  isRead: boolean;
  createdAt: string;
  payload?: Record<string, unknown> | null;
}

interface DashboardAuditEvent {
  id: number;
  action: string;
  status: string;
  createdAt: string;
}

interface OwnerDetachRequestView {
  id: number;
  staffName: string;
  staffLogin: string;
  tableTitle: string;
  reason: string;
  createdAt: string;
  status: string;
}

type StaffDetachStatusLabel = 'Отправлено' | 'Не прочитано' | 'Прочитано' | 'Выполнена';

