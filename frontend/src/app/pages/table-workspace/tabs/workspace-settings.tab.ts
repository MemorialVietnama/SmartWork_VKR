import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';

import {
  AuthService,
  AppearanceSettingsDto,
  EmployeeDto,
  NotificationSettingsDto,
  TableDetailDto,
} from '../../../core/auth/auth.service';
import { ThemeService } from '../../../core/theme.service';
import { TableWorkspaceState } from '../table-workspace.state';

type WorkspaceSettingsSection = 'notifications' | 'appearance' | 'table' | 'staff' | 'bonuses';

interface WorkspaceSettingsNavItem {
  id: WorkspaceSettingsSection;
  label: string;
}

interface TableDraft {
  title: string;
  description: string;
  timeFormat: string;
  weekStartDay: string;
  workDayStart: string;
  workDayEnd: string;
}

interface BonusCatalogItem {
  key: string;
  title: string;
  price: number;
  kind: 'quantity' | 'toggle';
  unitLabel?: string;
  maxQty?: number;
}

@Component({
  selector: 'app-workspace-settings-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, CardModule, ButtonModule, InputSwitchModule, InputTextModule, MessageModule],
  templateUrl: './workspace-settings.tab.html',
  styleUrl: './workspace-settings.tab.scss',
})
export class WorkspaceSettingsTabComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);
  protected readonly state = inject(TableWorkspaceState);

  protected readonly section = signal<WorkspaceSettingsSection>('notifications');

  protected readonly isOwner = computed(() => this.state.detail()?.can_edit_settings === true);

  protected readonly navItems = computed((): WorkspaceSettingsNavItem[] => {
    const base: WorkspaceSettingsNavItem[] = [
      { id: 'notifications', label: 'Уведомления' },
      { id: 'appearance', label: 'Оформление' },
    ];
    if (!this.isOwner()) {
      return base;
    }
    const ownerItems: WorkspaceSettingsNavItem[] = [
      { id: 'table', label: 'Настройки стола' },
      { id: 'staff', label: 'Управление сотрудниками' },
      { id: 'bonuses', label: 'Управление бонусами' },
    ];
    return [...base, ...ownerItems];
  });

  protected readonly notifications = signal<NotificationSettingsDto>({
    sources: { system: true, tables: true, employees: true },
    targets: { desktop: true, mobile: true, email: false },
  });

  protected readonly appearance = signal<AppearanceSettingsDto>({
    theme: 'auto',
    density: 'comfortable',
    card_size: 'medium',
  });

  protected readonly tableDraft = signal<TableDraft>({
    title: '',
    description: '',
    timeFormat: 'us',
    weekStartDay: 'monday',
    workDayStart: '09:00',
    workDayEnd: '18:00',
  });

  protected employees = signal<EmployeeDto[]>([]);
  protected employeesLoadError = signal<string | null>(null);
  protected staffActionError = signal<string | null>(null);
  protected selectedEmployeeId = signal<number | null>(null);

  protected readonly bonusCatalog: readonly BonusCatalogItem[] = [
    { key: 'extra_employee_seat', title: 'Доп. места для сотрудников', price: 500, kind: 'quantity', unitLabel: 'чел', maxQty: 50 },
    { key: 'extra_directories', title: 'Доп. справочники', price: 500, kind: 'quantity', unitLabel: 'шт', maxQty: 10 },
    { key: 'unlock_tasks', title: 'Раздел «Задачи»', price: 2900, kind: 'toggle' },
    { key: 'unlock_analytics', title: 'Раздел «Аналитика»', price: 4300, kind: 'toggle' },
    { key: 'unlock_employee_accounts', title: 'Аккаунты для сотрудников', price: 1900, kind: 'toggle' },
    { key: 'order_history_audit_12m', title: 'История заказов и аудит 12 мес.', price: 990, kind: 'toggle' },
    { key: 'service_support', title: 'Поддержка от сервиса', price: 390, kind: 'toggle' },
    { key: 'table_customization', title: 'Кастомизация стола', price: 290, kind: 'toggle' },
  ];

  protected bonusValues = signal<Record<string, number>>({});

  protected settingsLoading = signal(false);
  protected settingsError = signal<string | null>(null);
  protected settingsSaved = signal(false);

  protected tableSaveLoading = signal(false);
  protected tableSaveError = signal<string | null>(null);
  protected tableSaved = signal(false);

  protected presetRepairLoading = signal(false);
  protected presetRepairError = signal<string | null>(null);
  protected presetRepairResult = signal<string | null>(null);

  protected bonusLoadError = signal<string | null>(null);

  /** Кнопка восстановления: только владелец и шаблонные пресеты (в т.ч. старые опечатки в БД). */
  protected readonly canRepairPresetDirectories = computed(() => {
    const d = this.state.detail();
    if (!d?.can_edit_settings) {
      return false;
    }
    const p = (d.preset ?? '').trim().toLowerCase();
    if (!p || p === 'custom') {
      return false;
    }
    const allowed = new Set([
      'barbershop',
      'grooming',
      'grumming',
      'groomin',
      'barber',
      'barber_shop',
      'парикмахерская',
      'груминг',
      'грамминг',
    ]);
    return allowed.has(p);
  });

  ngOnInit(): void {
    this.loadUserSettings();
  }

  /** Вызов из шаблона с целым элементом — так тип `id` не теряется до `string`. */
  protected selectNavItem(item: WorkspaceSettingsNavItem): void {
    this.selectSection(item.id);
  }

  protected selectSection(id: WorkspaceSettingsSection): void {
    this.section.set(id);
    this.settingsSaved.set(false);
    this.tableSaved.set(false);
    if (id === 'table') {
      this.syncTableDraftFromDetail();
      this.presetRepairError.set(null);
      this.presetRepairResult.set(null);
    }
    if (id === 'staff') {
      this.loadEmployeesForStaff();
    }
    if (id === 'bonuses') {
      this.loadBonusValues();
    }
  }

  protected setNotifSource(key: 'system' | 'tables' | 'employees', value: boolean): void {
    this.notifications.update((n) => ({
      ...n,
      sources: { ...n.sources, [key]: value },
    }));
    this.settingsSaved.set(false);
  }

  protected setNotifTarget(key: 'desktop' | 'mobile' | 'email', value: boolean): void {
    this.notifications.update((n) => ({
      ...n,
      targets: { ...n.targets, [key]: value },
    }));
    this.settingsSaved.set(false);
  }

  protected setAppearanceTheme(ev: Event): void {
    const v = (ev.target as HTMLSelectElement).value as AppearanceSettingsDto['theme'];
    this.appearance.update((a) => ({ ...a, theme: v }));
    this.themeService.applyTheme(v);
    this.settingsSaved.set(false);
  }

  protected setAppearanceDensity(ev: Event): void {
    const v = (ev.target as HTMLSelectElement).value as AppearanceSettingsDto['density'];
    this.appearance.update((a) => ({ ...a, density: v }));
    this.settingsSaved.set(false);
  }

  protected setAppearanceCardSize(ev: Event): void {
    const v = (ev.target as HTMLSelectElement).value as AppearanceSettingsDto['card_size'];
    this.appearance.update((a) => ({ ...a, card_size: v }));
    this.settingsSaved.set(false);
  }

  protected updateTableDraft<K extends keyof TableDraft>(key: K, value: TableDraft[K]): void {
    this.tableDraft.update((d) => ({ ...d, [key]: value }));
    this.tableSaved.set(false);
  }

  protected saveUserPrefs(): void {
    this.settingsLoading.set(true);
    this.settingsError.set(null);
    this.settingsSaved.set(false);
    const appearance = this.appearance();
    const notifications = this.notifications();
    this.auth
      .updateMySettings({
        appearance: {
          theme: appearance.theme,
          density: appearance.density,
          card_size: appearance.card_size,
        },
        notifications,
      })
      .subscribe({
        next: (s) => {
          this.notifications.set({
            sources: { ...s.notifications.sources },
            targets: { ...s.notifications.targets },
          });
          this.appearance.set({ ...s.appearance });
          this.themeService.applyTheme(s.appearance.theme);
          this.settingsLoading.set(false);
          this.settingsSaved.set(true);
        },
        error: () => {
          this.settingsLoading.set(false);
          this.settingsError.set('Не удалось сохранить настройки.');
        },
      });
  }

  protected saveTableSettings(): void {
    const id = this.state.tableId();
    const d = this.tableDraft();
    if (d.title.trim().length < 2) {
      this.tableSaveError.set('Название стола — не короче 2 символов.');
      return;
    }
    if (!d.workDayStart || !d.workDayEnd) {
      this.tableSaveError.set('Укажите рабочие часы.');
      return;
    }
    this.tableSaveLoading.set(true);
    this.tableSaveError.set(null);
    this.tableSaved.set(false);
    this.auth
      .patchTableDetail(id, {
        title: d.title.trim(),
        description: d.description.trim() || null,
        time_format: d.timeFormat,
        week_start_day: d.weekStartDay,
        work_hours: `${d.workDayStart}-${d.workDayEnd}`,
      })
      .subscribe({
        next: (detail) => this.applyTableDetail(detail),
        error: (err) => {
          this.tableSaveLoading.set(false);
          this.tableSaveError.set(err?.error?.detail ?? 'Не удалось сохранить стол.');
        },
      });
  }

  protected addSelectedEmployeeToTable(): void {
    const tableId = this.state.tableId();
    const empId = this.selectedEmployeeId();
    if (!empId) {
      this.staffActionError.set('Выберите сотрудника.');
      return;
    }
    this.staffActionError.set(null);
    this.auth.addTableMember(tableId, empId).subscribe({
      next: () => {
        this.selectedEmployeeId.set(null);
        this.refreshMembersAndDetail();
      },
      error: (err) => {
        this.staffActionError.set(err?.error?.detail ?? 'Не удалось добавить в стол.');
      },
    });
  }

  protected openDashboardEmployees(): void {
    void this.router.navigate(['/dashboard'], { queryParams: { section: 'employees' } });
  }

  protected openDashboardSubscription(): void {
    void this.router.navigate(['/dashboard'], { queryParams: { section: 'subscription' } });
  }

  protected bonusQty(key: string): number {
    return this.bonusValues()[key] ?? 0;
  }

  protected setBonusToggle(key: string, enabled: boolean): void {
    this.bonusValues.update((m) => ({ ...m, [key]: enabled ? 1 : 0 }));
    this.persistBonuses();
  }

  protected changeBonusQty(key: string, delta: number, maxQty: number): void {
    const cur = this.bonusQty(key);
    const next = Math.min(Math.max(cur + delta, 0), maxQty);
    this.bonusValues.update((m) => ({ ...m, [key]: next }));
    this.persistBonuses();
  }

  protected repairPresetDirectories(): void {
    const tid = this.state.tableId();
    this.presetRepairLoading.set(true);
    this.presetRepairError.set(null);
    this.presetRepairResult.set(null);
    this.auth.repairPresetWorkspaceDirectories(tid).subscribe({
      next: (r) => {
        this.presetRepairLoading.set(false);
        this.presetRepairResult.set(r.detail);
      },
      error: (err: { error?: { detail?: string } }) => {
        this.presetRepairLoading.set(false);
        const d = err?.error?.detail;
        this.presetRepairError.set(typeof d === 'string' ? d : 'Не удалось восстановить справочники.');
      },
    });
  }

  protected tablePresetDisplay(): string {
    const d = this.state.detail();
    if (!d) {
      return '—';
    }
    const p = (d.preset ?? '').toLowerCase();
    const labels: Record<string, string> = {
      barbershop: 'Барбершоп',
      grooming: 'Груминг',
      custom: 'Своя',
    };
    const base = labels[p] ?? d.preset ?? '—';
    if (p === 'custom' && d.custom_preset_name) {
      return `${base}: ${d.custom_preset_name}`;
    }
    return base;
  }

  protected formatRub(value: number): string {
    return `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
  }

  protected onStaffSelect(ev: Event): void {
    const v = (ev.target as HTMLSelectElement).value;
    this.selectedEmployeeId.set(v ? Number(v) : null);
  }

  protected employeeLabel(e: EmployeeDto): string {
    const ln = e.last_name?.trim() ?? '';
    const fn = e.first_name?.trim() ?? '';
    const t = `${ln} ${fn}`.trim();
    return t || `Учётная запись #${e.id}`;
  }

  protected staffCandidates(): EmployeeDto[] {
    const memberIds = new Set(this.state.members().map((m) => m.user_id));
    return this.employees().filter((e) => !memberIds.has(e.id));
  }

  private loadUserSettings(): void {
    this.settingsLoading.set(true);
    this.settingsError.set(null);
    this.auth.mySettings().subscribe({
      next: (s) => {
        this.notifications.set({
          sources: { ...s.notifications.sources },
          targets: { ...s.notifications.targets },
        });
        this.appearance.set({ ...s.appearance });
        this.themeService.applyTheme(s.appearance.theme);
        this.settingsLoading.set(false);
      },
      error: () => {
        this.settingsLoading.set(false);
        this.settingsError.set('Не удалось загрузить настройки аккаунта.');
      },
    });
  }

  private syncTableDraftFromDetail(): void {
    const d = this.state.detail();
    if (!d) {
      return;
    }
    const wh = this.splitWorkHours(d.work_hours);
    this.tableDraft.set({
      title: d.title,
      description: d.description ?? '',
      timeFormat: (d.time_format as TableDraft['timeFormat']) || 'us',
      weekStartDay: (d.week_start_day as TableDraft['weekStartDay']) || 'monday',
      workDayStart: wh.start,
      workDayEnd: wh.end,
    });
    this.tableSaveError.set(null);
  }

  private splitWorkHours(wh: string | null | undefined): { start: string; end: string } {
    if (!wh || !wh.includes('-')) {
      return { start: '09:00', end: '18:00' };
    }
    const [a, b] = wh.split('-').map((s) => s.trim());
    return { start: a || '09:00', end: b || '18:00' };
  }

  private applyTableDetail(d: TableDetailDto): void {
    this.state.detail.set(d);
    const map: Record<string, number> = {};
    (d.bonuses ?? []).forEach((b) => {
      map[b.key] = b.qty;
    });
    this.state.bonusMap.set(map);
    this.tableSaveLoading.set(false);
    this.tableSaved.set(true);
    this.syncTableDraftFromDetail();
  }

  private loadEmployeesForStaff(): void {
    this.employeesLoadError.set(null);
    this.auth.myEmployees().subscribe({
      next: (list) => this.employees.set(list),
      error: () => this.employeesLoadError.set('Не удалось загрузить список сотрудников.'),
    });
  }

  private refreshMembersAndDetail(): void {
    const tableId = this.state.tableId();
    this.auth.listTableWorkspaceMembers(tableId).subscribe({
      next: (m) => this.state.members.set(m),
    });
    this.auth.getTableDetail(tableId).subscribe({
      next: (d) => {
        this.state.detail.set(d);
        const map: Record<string, number> = {};
        (d.bonuses ?? []).forEach((b) => {
          map[b.key] = b.qty;
        });
        this.state.bonusMap.set(map);
      },
    });
  }

  private loadBonusValues(): void {
    const tableId = this.state.tableId();
    this.bonusLoadError.set(null);
    this.auth.myTableSubscriptions().subscribe({
      next: (subs) => {
        const row = subs.find((s) => s.table_id === tableId);
        const values: Record<string, number> = {};
        (row?.bonuses ?? []).forEach((b) => {
          values[b.key] = b.qty;
        });
        this.bonusValues.set(values);
      },
      error: () => this.bonusLoadError.set('Не удалось загрузить бонусы стола.'),
    });
  }

  private persistBonuses(): void {
    const tableId = this.state.tableId();
    const values = this.bonusValues();
    const bonuses = Object.entries(values)
      .filter(([, qty]) => qty > 0)
      .map(([key, qty]) => ({ key, qty }));
    this.auth.updateTableSubscription(tableId, { bonuses }).subscribe({
      next: () => this.refreshDetailOnly(),
      error: () => this.bonusLoadError.set('Не удалось сохранить бонусы.'),
    });
  }

  private refreshDetailOnly(): void {
    const tableId = this.state.tableId();
    this.auth.getTableDetail(tableId).subscribe({
      next: (d) => {
        this.state.detail.set(d);
        const map: Record<string, number> = {};
        (d.bonuses ?? []).forEach((b) => {
          map[b.key] = b.qty;
        });
        this.state.bonusMap.set(map);
      },
    });
  }
}
