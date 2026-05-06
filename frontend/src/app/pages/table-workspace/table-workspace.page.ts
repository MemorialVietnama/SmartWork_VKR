import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { distinctUntilChanged, forkJoin } from 'rxjs';

import { ButtonModule } from 'primeng/button';

import { AuthService, WorkspaceOrderDto } from '../../core/auth/auth.service';
import { TableWorkspaceState } from './table-workspace.state';

@Component({
  selector: 'app-table-workspace',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule],
  providers: [TableWorkspaceState],
  templateUrl: './table-workspace.page.html',
  styleUrl: './table-workspace.page.scss',
})
export class TableWorkspacePageComponent implements OnInit {
  protected readonly state = inject(TableWorkspaceState);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pm) => {
      const raw = pm.get('tableId');
      const id = raw ? Number(raw) : NaN;
      if (!Number.isFinite(id) || id < 1) {
        void this.router.navigate(['/dashboard']);
        return;
      }
      this.state.tableId.set(id);
      this.reloadContext(id);
    });

    toObservable(this.state.contextReloadTick)
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const id = this.state.tableId();
        if (id > 0) {
          this.reloadContext(id, true);
        }
      });
  }

  private reloadContext(tableId: number, silent = false): void {
    if (!silent) {
      this.state.loading.set(true);
      this.state.sidebarError.set(null);
    }
    forkJoin({
      detail: this.auth.getTableDetail(tableId),
      members: this.auth.listTableWorkspaceMembers(tableId),
      queued: this.auth.listWorkspaceOrders(tableId, { status: 'queued', limit: 8 }),
      history: this.auth.listWorkspaceOrders(tableId, { status: 'completed', limit: 8 }),
    }).subscribe({
      next: ({ detail, members, queued, history }) => {
        this.state.detail.set(detail);
        this.state.members.set(members);
        const map: Record<string, number> = {};
        (detail.bonuses ?? []).forEach((b) => {
          map[b.key] = b.qty;
        });
        this.state.bonusMap.set(map);
        this.state.queuedOrders.set(queued);
        this.state.historyOrders.set(history);
        if (!silent) {
          this.state.loading.set(false);
        }
      },
      error: () => {
        if (!silent) {
          this.state.loading.set(false);
          this.state.sidebarError.set('Не удалось загрузить стол или нет доступа.');
        }
      },
    });
  }

  protected backToTables(): void {
    void this.router.navigate(['/dashboard'], { queryParams: { section: 'tables' } });
  }

  protected openOrderInCalendar(order: WorkspaceOrderDto): void {
    const at = order.starts_at ?? order.created_at ?? null;
    void this.router.navigate(['calendar'], {
      relativeTo: this.route,
      queryParams: {
        focusOrderId: order.id,
        focusAt: at,
      },
      queryParamsHandling: 'merge',
    });
  }

  protected copyOrderNumber(order: WorkspaceOrderDto): void {
    const value = order.order_number ?? String(order.id);
    void navigator.clipboard?.writeText(value);
  }

  protected orderStatusLabel(status: string | null | undefined): string {
    const normalized = (status ?? '').toLowerCase();
    if (normalized === 'queued') return 'В очереди';
    if (normalized === 'in_progress') return 'В работе';
    if (normalized === 'completed') return 'Завершен';
    if (normalized === 'cancelled') return 'Отменен';
    return status ?? '—';
  }

  protected orderStatusClass(status: string | null | undefined): string {
    const normalized = (status ?? '').toLowerCase();
    if (normalized === 'queued') return 'queued';
    if (normalized === 'in_progress') return 'in-progress';
    if (normalized === 'completed') return 'completed';
    if (normalized === 'cancelled') return 'cancelled';
    return 'unknown';
  }

  protected presetLabel(value: string | null | undefined, customPresetName: string | null | undefined): string {
    if (customPresetName?.trim()) {
      return customPresetName.trim();
    }
    const normalized = (value ?? '').toLowerCase();
    if (normalized === 'barbershop') return 'Барбершоп';
    if (normalized === 'grooming') return 'Груминг';
    if (normalized === 'custom') return 'Индивидуальная';
    return value ?? '—';
  }

  protected timeFormatLabel(value: string | null | undefined): string {
    const normalized = (value ?? '').toLowerCase();
    if (normalized === 'us') return '12 часов (AM/PM)';
    if (normalized === 'eu') return '24 часа';
    return value ?? '—';
  }

  protected weekStartDayLabel(value: string | null | undefined): string {
    const normalized = (value ?? '').toLowerCase();
    if (normalized === 'monday') return 'Понедельник';
    if (normalized === 'tuesday') return 'Вторник';
    if (normalized === 'wednesday') return 'Среда';
    if (normalized === 'thursday') return 'Четверг';
    if (normalized === 'friday') return 'Пятница';
    if (normalized === 'saturday') return 'Суббота';
    if (normalized === 'sunday') return 'Воскресенье';
    return value ?? '—';
  }

  protected workHoursLabel(value: string | null | undefined): string {
    if (!value?.trim()) {
      return '—';
    }
    return value.trim().replace('-', ' - ');
  }

  protected activeBonusLabels(): string[] {
    const bonuses = this.state.detail()?.bonuses ?? [];
    return bonuses
      .filter((bonus) => bonus.qty > 0)
      .map((bonus) => this.bonusLabel(bonus.key, bonus.qty));
  }

  private bonusLabel(key: string, qty: number): string {
    if (key === 'extra_employee_seat') return `Доп. места для сотрудников: ${qty}`;
    if (key === 'extra_directories') return `Доп. справочники: ${qty}`;
    if (key === 'unlock_tasks') return 'Открытие раздела «Задачи»';
    if (key === 'unlock_analytics') return 'Открытие раздела «Аналитика»';
    if (key === 'unlock_employee_accounts') return 'Открытие раздела «Аккаунты сотрудников»';
    if (key === 'order_history_audit_12m') return 'История заказов и аудит (12 мес)';
    if (key === 'service_support') return 'Поддержка от сервиса';
    if (key === 'table_customization') return 'Кастомизация стола';
    return `${key}: ${qty}`;
  }

  protected formatOrderDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const dt = new Date(value);
    if (!Number.isFinite(dt.getTime())) return '—';
    return dt.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
