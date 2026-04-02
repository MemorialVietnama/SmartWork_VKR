import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { forkJoin } from 'rxjs';

import { ButtonModule } from 'primeng/button';

import { AuthService } from '../../core/auth/auth.service';
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
  }

  private reloadContext(tableId: number): void {
    this.state.loading.set(true);
    this.state.sidebarError.set(null);
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
        this.state.loading.set(false);
      },
      error: () => {
        this.state.loading.set(false);
        this.state.sidebarError.set('Не удалось загрузить стол или нет доступа.');
      },
    });
  }

  protected backToTables(): void {
    void this.router.navigate(['/dashboard'], { queryParams: { section: 'tables' } });
  }
}
