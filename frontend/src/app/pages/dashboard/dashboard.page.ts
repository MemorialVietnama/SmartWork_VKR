import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputSwitchModule } from 'primeng/inputswitch';

import {
  AuthService,
  EmployeeDto,
  MeDto,
  NotificationSettingsDto,
  TableAnalyticsDto,
  TableDto,
  UserSettingsDto,
} from '../../core/auth/auth.service';

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
    DialogModule,
    InputTextModule,
    InputSwitchModule,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly analyticsBonusKey = 'unlock_analytics';

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
  protected analyticsTables: TableAnalytics[] = [];
  protected ownerEmployees: EmployeeCard[] = [];
  protected employeeTableSelections: Record<number, number[]> = {};
  protected employeeTableEditMode: Record<number, boolean> = {};
  protected employeeTableBindingMessage: Record<number, string | null> = {};
  protected detachedEmployeesCount = 0;
  protected employeeDialogVisible = false;
  protected employeeDialogMode: 'create' | 'edit' = 'create';
  protected inviteDialogVisible = false;
  protected inviteLink = '';
  protected staffInviteCode = '';
  protected staffInviteMessage: string | null = null;
  protected logoutConfirmVisible = false;
  protected openedTableMenuId: number | null = null;
  protected tableMembersDialogVisible = false;
  protected selectedTableForMembers: WorkspaceTableCard | null = null;
  protected tableMembersActionError: string | null = null;
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

  ngOnInit(): void {
    this.load();
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
        if (u.role === 'owner') {
          this.loadOwnerEmployees();
          this.loadEmployeeTableBindings();
        }
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = 'Сессия не действительна. Выполните вход заново.';
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
    const tableId = this.ownerTables[0]?.id;
    if (!tableId) {
      this.formError = 'Сначала создайте стол для приглашения.';
      return;
    }
    this.auth.createTableInvite(tableId).subscribe({
      next: (resp) => {
        this.inviteLink = `${window.location.origin}/auth/invite-register?code=${encodeURIComponent(resp.code)}`;
        this.inviteDialogVisible = true;
      },
      error: () => {
        this.formError = 'Не удалось создать приглашение.';
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
    this.staffInviteMessage = `Заявка на открепление от стола #${tableId} отправлена владельцу.`;
    this.openedTableMenuId = null;
  }

  protected openTableSettings(tableId: number): void {
    const table = this.ownerTables.find((item) => item.id === tableId);
    if (!table) return;
    this.staffInviteMessage = `Просмотр настроек стола: ${table.title}`;
    this.openedTableMenuId = null;
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

  protected openTableTasks(tableId: number): void {
    this.staffInviteMessage = `Открыт просмотр задач стола #${tableId}`;
    this.openedTableMenuId = null;
  }

  protected openTableAnalytics(tableId: number): void {
    this.selectedCategory = 'analytics';
    this.openedTableMenuId = null;
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
    this.tableDialogVisible = true;
  }

  protected submitCreateTable(): void {
    const title = this.tableForm.title.trim();
    if (title.length < 2) {
      this.tableFormError = 'Название стола должно быть не короче 2 символов.';
      return;
    }
    if (this.tableForm.preset === 'custom' && this.tableForm.customPresetName.trim().length < 2) {
      this.tableFormError = 'Укажите название своей предустановки.';
      return;
    }
    if (!this.tableForm.workDayStart || !this.tableForm.workDayEnd) {
      this.tableFormError = 'Укажите рабочие часы.';
      return;
    }

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
    this.notificationsSettings = {
      sources: { ...settings.notifications.sources },
      targets: { ...settings.notifications.targets },
    };
  }

  private loadAnalyticsTables(): void {
    this.auth.myTablesAnalytics().subscribe({
      next: (tables) => {
        this.analyticsTables = tables.map((table) => this.mapAnalyticsDto(table));
      },
      error: () => {
        this.analyticsTables = [];
      },
    });
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
    };
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

