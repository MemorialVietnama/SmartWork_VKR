import { Injectable, signal } from '@angular/core';

import { TableDetailDto, TableMemberBriefDto, WorkspaceOrderDto } from '../../core/auth/auth.service';

@Injectable()
export class TableWorkspaceState {
  readonly tableId = signal(0);
  readonly detail = signal<TableDetailDto | null>(null);
  readonly members = signal<TableMemberBriefDto[]>([]);
  readonly bonusMap = signal<Record<string, number>>({});
  readonly queuedOrders = signal<WorkspaceOrderDto[]>([]);
  readonly historyOrders = signal<WorkspaceOrderDto[]>([]);
  readonly calendarReloadTick = signal(0);
  readonly loading = signal(true);
  readonly sidebarError = signal<string | null>(null);

  bonusQty(key: string): number {
    return this.bonusMap()[key] ?? 0;
  }

  bumpCalendarReload(): void {
    this.calendarReloadTick.update((value) => value + 1);
  }
}
