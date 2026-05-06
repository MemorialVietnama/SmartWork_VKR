import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CdkDragDrop, DragDropModule, transferArrayItem } from '@angular/cdk/drag-drop';

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

type WorkspaceSettingsSection = 'notifications' | 'appearance' | 'table' | 'staff';

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

@Component({
  selector: 'app-workspace-settings-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, CardModule, ButtonModule, InputSwitchModule, InputTextModule, MessageModule, DragDropModule],
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
  protected connectedEmployees = signal<EmployeeDto[]>([]);
  protected freeEmployees = signal<EmployeeDto[]>([]);
  protected positionDrafts = signal<Record<number, string>>({});

  protected settingsLoading = signal(false);
  protected settingsError = signal<string | null>(null);
  protected settingsSaved = signal(false);

  protected tableSaveLoading = signal(false);
  protected tableSaveError = signal<string | null>(null);
  protected tableSaved = signal(false);

  protected presetRepairLoading = signal(false);
  protected presetRepairError = signal<string | null>(null);
  protected presetRepairResult = signal<string | null>(null);

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
          density: 'comfortable',
          card_size: 'medium',
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

  protected openDashboardEmployees(): void {
    void this.router.navigate(['/dashboard'], { queryParams: { section: 'employees' } });
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

  protected employeeLabel(e: EmployeeDto): string {
    const ln = e.last_name?.trim() ?? '';
    const fn = e.first_name?.trim() ?? '';
    const t = `${ln} ${fn}`.trim();
    return t || `Учётная запись #${e.id}`;
  }

  protected dropToConnected(event: CdkDragDrop<EmployeeDto[]>): void {
    if (event.previousContainer === event.container) {
      return;
    }
    const moved = event.previousContainer.data[event.previousIndex];
    transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
    this.staffActionError.set(null);
    this.auth.addTableMember(this.state.tableId(), moved.id).subscribe({
      next: () => this.refreshMembersAndDetail(),
      error: (err) => {
        this.staffActionError.set(err?.error?.detail ?? 'Не удалось добавить сотрудника в стол.');
        this.refreshMembersAndDetail();
      },
    });
  }

  protected dropToFree(event: CdkDragDrop<EmployeeDto[]>): void {
    if (event.previousContainer === event.container) {
      return;
    }
    const moved = event.previousContainer.data[event.previousIndex];
    transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
    this.staffActionError.set(null);
    this.auth.removeTableWorkspaceMember(this.state.tableId(), moved.id).subscribe({
      next: () => this.refreshMembersAndDetail(),
      error: (err) => {
        this.staffActionError.set(err?.error?.detail ?? 'Не удалось удалить сотрудника из стола.');
        this.refreshMembersAndDetail();
      },
    });
  }

  protected getPositionDraft(employee: EmployeeDto): string {
    return this.positionDrafts()[employee.id] ?? employee.position ?? '';
  }

  protected setPositionDraft(employeeId: number, value: string): void {
    this.positionDrafts.update((drafts) => ({ ...drafts, [employeeId]: value }));
  }

  protected saveEmployeePosition(employee: EmployeeDto): void {
    if (!employee.last_name || !employee.first_name || !employee.birth_date || !employee.phone) {
      this.staffActionError.set('Нельзя обновить должность: у сотрудника не заполнены обязательные поля профиля.');
      return;
    }
    this.staffActionError.set(null);
    this.auth
      .updateEmployee(employee.id, {
        last_name: employee.last_name,
        first_name: employee.first_name,
        middle_name: employee.middle_name ?? null,
        birth_date: employee.birth_date,
        phone: employee.phone,
        position: this.getPositionDraft(employee).trim(),
        note: employee.note ?? null,
      })
      .subscribe({
        next: () => this.loadEmployeesForStaff(),
        error: (err) => {
          this.staffActionError.set(err?.error?.detail ?? 'Не удалось обновить должность сотрудника.');
        },
      });
  }

  protected ownerMemberLabel(): string {
    const owner = this.state.members().find((m) => m.is_owner);
    return owner?.short_name ?? 'Владелец';
  }

  protected ownerMemberPosition(): string {
    const owner = this.state.members().find((m) => m.is_owner);
    return owner?.position ?? '—';
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
      next: (list) => {
        this.employees.set(list);
        this.rebuildStaffLists();
      },
      error: () => this.employeesLoadError.set('Не удалось загрузить список сотрудников.'),
    });
  }

  private refreshMembersAndDetail(): void {
    const tableId = this.state.tableId();
    this.auth.listTableWorkspaceMembers(tableId).subscribe({
      next: (m) => {
        this.state.members.set(m);
        this.rebuildStaffLists();
      },
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

  private rebuildStaffLists(): void {
    const members = this.state.members();
    const memberIds = new Set(members.map((m) => m.user_id));
    const connected = this.employees().filter((e) => memberIds.has(e.id));
    const free = this.employees().filter((e) => !memberIds.has(e.id));
    this.connectedEmployees.set(connected);
    this.freeEmployees.set(free);
    const draft: Record<number, string> = {};
    connected.forEach((employee) => {
      draft[employee.id] = employee.position ?? '';
    });
    this.positionDrafts.set(draft);
  }
}
