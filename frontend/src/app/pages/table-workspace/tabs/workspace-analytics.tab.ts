import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';

import { AuthService, TableAnalyticsDto } from '../../../core/auth/auth.service';
import { TableWorkspaceState } from '../table-workspace.state';

@Component({
  selector: 'app-workspace-analytics-tab',
  standalone: true,
  imports: [FormsModule, CardModule, ButtonModule, ChartModule],
  templateUrl: './workspace-analytics.tab.html',
  styleUrl: './workspace-analytics.tab.scss',
})
export class WorkspaceAnalyticsTabComponent implements OnInit {
  private readonly auth = inject(AuthService);
  protected readonly state = inject(TableWorkspaceState);

  protected data: TableAnalyticsDto | null = null;
  protected err: string | null = null;
  protected loading = false;
  protected period: '7d' | '30d' | '90d' | '365d' = '30d';
  protected bucket: 'day' | 'week' = 'day';
  protected selectedChartTitle: string | null = null;
  protected selectedKpiKey = 'orders_created';
  protected selectedCategory: 'orders' | 'services' | 'employees' = 'orders';
  protected statusFilter = '';
  protected assigneeFilter: number | null = null;
  protected serviceFilter: number | null = null;
  protected readonly periods = [
    { id: '7d' as const, label: '7 дней' },
    { id: '30d' as const, label: '30 дней' },
    { id: '90d' as const, label: '90 дней' },
    { id: '365d' as const, label: '365 дней' },
  ];

  ngOnInit(): void {
    if (this.state.bonusQty('unlock_analytics') <= 0) {
      this.data = null;
      return;
    }
    this.fetchAnalytics();
  }

  protected get unlocked(): boolean {
    return this.state.bonusQty('unlock_analytics') > 0;
  }

  protected selectPeriod(period: '7d' | '30d' | '90d' | '365d'): void {
    this.period = period;
    this.bucket = period === '365d' ? 'week' : 'day';
    this.fetchAnalytics();
  }

  protected kpis(): Array<{ key: string; title: string; value: string; delta: string }> {
    const source = this.data?.kpis ?? [];
    return source.slice(0, 8).map((item) => ({
      key: item.key,
      title: item.title,
      value: this.formatKpiValue(item.value, item.unit ?? null),
      delta: item.delta_percent == null ? '0%' : this.formatSignedPercent(item.delta_percent),
    }));
  }

  protected selectKpi(key: string): void {
    this.selectedKpiKey = key;
  }

  protected selectChart(title: string): void {
    this.selectedChartTitle = this.selectedChartTitle === title ? null : title;
  }

  protected selectCategory(category: 'orders' | 'services' | 'employees'): void {
    this.selectedCategory = category;
  }

  protected setStatusFilter(value: string): void {
    this.statusFilter = value;
    this.fetchAnalytics();
  }

  protected setAssigneeFilter(value: string): void {
    this.assigneeFilter = value ? Number(value) : null;
    this.fetchAnalytics();
  }

  protected setServiceFilter(value: string): void {
    this.serviceFilter = value ? Number(value) : null;
    this.fetchAnalytics();
  }

  protected trendData(): unknown {
    const selected = this.data?.charts.find((chart) => chart.title === this.selectedChartTitle);
    const chart = selected ?? this.data?.charts[0];
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
    const charts = this.data?.charts ?? [];
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
    const rows = this.data?.breakdown ?? [];
    return rows.map((row) => ({ label: row.label, value: this.formatMetric(row.value) }));
  }

  protected drilldownRows(): Array<{ label: string; value: number }> {
    if (this.selectedCategory === 'services') {
      return (this.data?.service_breakdown ?? []).map((row) => ({
        label: `${row.label} (${row.orders_total} заказов)`,
        value: row.revenue_total,
      }));
    }
    if (this.selectedCategory === 'employees') {
      return (this.data?.employee_breakdown ?? []).map((row) => ({
        label: `${row.label} (${row.completed_total}/${row.orders_total})`,
        value: row.revenue_total,
      }));
    }
    if (!this.selectedChartTitle) {
      return [];
    }
    const chart = this.data?.charts.find((item) => item.title === this.selectedChartTitle);
    if (!chart) {
      return [];
    }
    return chart.values.map((value, index) => ({ label: `Период ${index + 1}`, value }));
  }

  protected chartLabels(): Array<{ title: string; subtitle: string }> {
    return (this.data?.charts ?? []).map((chart) => ({ title: chart.title, subtitle: chart.subtitle }));
  }

  protected employeeFilterOptions(): Array<{ id: number; label: string }> {
    return (this.data?.employee_breakdown ?? [])
      .filter((row) => row.assignee_user_id != null)
      .map((row) => ({ id: Number(row.assignee_user_id), label: row.label }));
  }

  protected serviceFilterOptions(): Array<{ id: number; label: string }> {
    return (this.data?.service_breakdown ?? [])
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

  private fetchAnalytics(): void {
    this.loading = true;
    this.err = null;
    const range = this.buildRangeByPeriod(this.period);
    this.auth
      .getTableWorkspaceAnalytics(this.state.tableId(), {
        from: range.from,
        to: range.to,
        bucket: this.bucket,
        status: this.statusFilter || undefined,
        assignee_user_id: this.assigneeFilter ?? undefined,
        service_item_id: this.serviceFilter ?? undefined,
      })
      .subscribe({
        next: (d) => {
          this.data = d;
          this.loading = false;
          this.selectedChartTitle = d.charts[0]?.title ?? null;
        },
        error: (e) => {
          this.loading = false;
          this.err = e?.error?.detail ?? 'Нет доступа к аналитике';
        },
      });
  }

  private buildRangeByPeriod(period: '7d' | '30d' | '90d' | '365d'): { from: string; to: string } {
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
