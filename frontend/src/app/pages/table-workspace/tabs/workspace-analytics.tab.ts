import { Component, inject, OnInit } from '@angular/core';

import { CardModule } from 'primeng/card';

import { AuthService, TableAnalyticsDto } from '../../../core/auth/auth.service';
import { TableWorkspaceState } from '../table-workspace.state';

@Component({
  selector: 'app-workspace-analytics-tab',
  standalone: true,
  imports: [CardModule],
  templateUrl: './workspace-analytics.tab.html',
})
export class WorkspaceAnalyticsTabComponent implements OnInit {
  private readonly auth = inject(AuthService);
  protected readonly state = inject(TableWorkspaceState);

  protected data: TableAnalyticsDto | null = null;
  protected err: string | null = null;

  ngOnInit(): void {
    if (this.state.bonusQty('unlock_analytics') <= 0) {
      this.data = null;
      return;
    }
    this.auth.getTableWorkspaceAnalytics(this.state.tableId()).subscribe({
      next: (d) => (this.data = d),
      error: (e) => (this.err = e?.error?.detail ?? 'Нет доступа к аналитике'),
    });
  }

  protected get unlocked(): boolean {
    return this.state.bonusQty('unlock_analytics') > 0;
  }

  protected chartMax(values: number[]): number {
    return Math.max(1, ...values);
  }

  protected chartAvg(values: number[]): number {
    if (!values.length) return 0;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }
}
