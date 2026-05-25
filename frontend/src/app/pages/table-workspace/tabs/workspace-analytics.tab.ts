import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, distinctUntilChanged, finalize, of, switchMap } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';

import { AuthService, TableAnalyticsDto } from '../../../core/auth/auth.service';
import { TableWorkspaceState } from '../table-workspace.state';

type AnalyticsPeriod = '7d' | '30d' | '90d' | '365d';

interface AnalyticsFetchKey {
  tableId: number;
  unlocked: boolean;
  period: AnalyticsPeriod;
  bucket: 'day' | 'week';
  statusFilter: string;
  assigneeFilter: number | null;
  serviceFilter: number | null;
  contextTick: number;
}

@Component({
  selector: 'app-workspace-analytics-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, CardModule, ButtonModule, ChartModule],
  templateUrl: './workspace-analytics.tab.html',
  styleUrl: './workspace-analytics.tab.scss',
})
export class WorkspaceAnalyticsTabComponent {
  private readonly auth = inject(AuthService);
  protected readonly state = inject(TableWorkspaceState);

  protected readonly data = signal<TableAnalyticsDto | null>(null);
  protected readonly err = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly period = signal<AnalyticsPeriod>('30d');
  protected readonly selectedChartTitle = signal<string | null>(null);
  protected readonly selectedKpiKey = signal('orders_created');
  protected readonly selectedCategory = signal<'orders' | 'services' | 'employees'>('orders');
  protected readonly statusFilter = signal('');
  protected readonly assigneeFilter = signal<number | null>(null);
  protected readonly serviceFilter = signal<number | null>(null);
  protected readonly periods = [
    { id: '7d' as const, label: '7 дней' },
    { id: '30d' as const, label: '30 дней' },
    { id: '90d' as const, label: '90 дней' },
    { id: '365d' as const, label: '365 дней' },
  ];

  protected readonly unlocked = computed(() => this.state.bonusQty('unlock_analytics') > 0);

  private readonly fetchKey = computed<AnalyticsFetchKey>(() => ({
    tableId: this.state.tableId(),
    unlocked: this.unlocked(),
    period: this.period(),
    bucket: this.period() === '365d' ? 'week' : 'day',
    statusFilter: this.statusFilter(),
    assigneeFilter: this.assigneeFilter(),
    serviceFilter: this.serviceFilter(),
    contextTick: this.state.contextReloadTick(),
  }));

  constructor() {
    toObservable(this.fetchKey)
      .pipe(
        distinctUntilChanged((a, b) => this.sameFetchKey(a, b)),
        switchMap((key) => {
          if (!key.tableId || !key.unlocked) {
            this.data.set(null);
            this.err.set(null);
            this.loading.set(false);
            return of<TableAnalyticsDto | null>(null);
          }
          this.loading.set(true);
          this.err.set(null);
          const range = this.buildRangeByPeriod(key.period);
          return this.auth
            .getTableWorkspaceAnalytics(key.tableId, {
              from: range.from,
              to: range.to,
              bucket: key.bucket,
              status: key.statusFilter || undefined,
              assignee_user_id: key.assigneeFilter ?? undefined,
              service_item_id: key.serviceFilter ?? undefined,
            })
            .pipe(
              catchError((e) => {
                this.err.set(e?.error?.detail ?? 'Нет доступа к аналитике');
                return of<TableAnalyticsDto | null>(null);
              }),
              finalize(() => this.loading.set(false)),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((d) => {
        this.data.set(d);
        if (d) {
          this.selectedChartTitle.set(d.charts[0]?.title ?? null);
        }
      });
  }

  protected selectPeriod(period: AnalyticsPeriod): void {
    this.period.set(period);
  }

  protected kpis(): Array<{ key: string; title: string; value: string; delta: string }> {
    const source = this.data()?.kpis ?? [];
    return source.slice(0, 8).map((item) => ({
      key: item.key,
      title: item.title,
      value: this.formatKpiValue(item.value, item.unit ?? null),
      delta: item.delta_percent == null ? '0%' : this.formatSignedPercent(item.delta_percent),
    }));
  }

  protected selectKpi(key: string): void {
    this.selectedKpiKey.set(key);
  }

  protected selectChart(title: string): void {
    this.selectedChartTitle.update((current) => (current === title ? null : title));
  }

  protected selectCategory(category: 'orders' | 'services' | 'employees'): void {
    this.selectedCategory.set(category);
  }

  protected setStatusFilter(value: string): void {
    this.statusFilter.set(value);
  }

  protected setAssigneeFilter(value: string): void {
    this.assigneeFilter.set(value ? Number(value) : null);
  }

  protected setServiceFilter(value: string): void {
    this.serviceFilter.set(value ? Number(value) : null);
  }

  protected trendData(): unknown {
    const analytics = this.data();
    const selected = analytics?.charts.find((chart) => chart.title === this.selectedChartTitle());
    const chart = selected ?? analytics?.charts[0];
    if (!chart) {
      return { labels: [], datasets: [] };
    }
    return {
      labels: chart.values.map((_, idx) => `${idx + 1}`),
      datasets: [
        {
          label: chart.title,
          data: chart.values,
          fill: true,
          tension: 0.35,
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79,70,229,0.18)',
        },
      ],
    };
  }

  protected distributionData(): unknown {
    const charts = this.data()?.charts ?? [];
    return {
      labels: charts.map((chart) => chart.title),
      datasets: [
        {
          label: 'Средние значения',
          data: charts.map((chart) => this.chartAvg(chart.values)),
          backgroundColor: ['#4f46e5', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'],
        },
      ],
    };
  }

  protected trendOptions(): unknown {
    return {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true } },
    };
  }

  protected distributionOptions(): unknown {
    return {
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } },
    };
  }

  protected insightRows(): Array<{ label: string; value: string }> {
    const rows = this.data()?.breakdown ?? [];
    return rows.map((row) => ({ label: row.label, value: this.formatMetric(row.value) }));
  }

  protected drilldownRows(): Array<{ label: string; value: number }> {
    const analytics = this.data();
    if (this.selectedCategory() === 'services') {
      return (analytics?.service_breakdown ?? []).map((row) => ({
        label: `${row.label} (${row.orders_total} заказов)`,
        value: row.revenue_total,
      }));
    }
    if (this.selectedCategory() === 'employees') {
      return (analytics?.employee_breakdown ?? []).map((row) => ({
        label: `${row.label} (${row.completed_total}/${row.orders_total})`,
        value: row.revenue_total,
      }));
    }
    const chartTitle = this.selectedChartTitle();
    if (!chartTitle) {
      return [];
    }
    const chart = analytics?.charts.find((item) => item.title === chartTitle);
    if (!chart) {
      return [];
    }
    return chart.values.map((value, index) => ({ label: `Период ${index + 1}`, value }));
  }

  protected chartLabels(): Array<{ title: string; subtitle: string }> {
    return (this.data()?.charts ?? []).map((chart) => ({ title: chart.title, subtitle: chart.subtitle }));
  }

  protected employeeFilterOptions(): Array<{ id: number; label: string }> {
    return (this.data()?.employee_breakdown ?? [])
      .filter((row) => row.assignee_user_id != null)
      .map((row) => ({ id: Number(row.assignee_user_id), label: row.label }));
  }

  protected serviceFilterOptions(): Array<{ id: number; label: string }> {
    return (this.data()?.service_breakdown ?? [])
      .filter((row) => row.service_item_id != null)
      .map((row) => ({ id: Number(row.service_item_id), label: row.label }));
  }

  protected chartMax(values: number[]): number {
    return Math.max(1, ...values);
  }

  protected chartAvg(values: number[]): number {
    if (!values.length) return 0;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }

  private sameFetchKey(a: AnalyticsFetchKey, b: AnalyticsFetchKey): boolean {
    return (
      a.tableId === b.tableId &&
      a.unlocked === b.unlocked &&
      a.period === b.period &&
      a.bucket === b.bucket &&
      a.statusFilter === b.statusFilter &&
      a.assigneeFilter === b.assigneeFilter &&
      a.serviceFilter === b.serviceFilter &&
      a.contextTick === b.contextTick
    );
  }

  private buildRangeByPeriod(period: AnalyticsPeriod): { from: string; to: string } {
    const now = new Date();
    const from = new Date(now);
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;
    from.setDate(from.getDate() - (days - 1));
    return { from: from.toISOString(), to: now.toISOString() };
  }

  private formatSignedPercent(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    if (rounded > 0) {
      return `+${rounded}%`;
    }
    return `${rounded}%`;
  }

  private formatKpiValue(value: number, unit: string | null): string {
    const base = this.formatMetric(value);
    return unit ? `${base} ${unit}` : base;
  }

  private formatMetric(value: number): string {
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(2);
  }
}
