import { Component, inject, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { ApiService, SystemConnectionsStatus } from '../../core/services/api.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-status',
  standalone: true,
  imports: [DatePipe, CardModule, ButtonModule, TagModule, MessageModule, ProgressSpinnerModule],
  templateUrl: './status.page.html',
  styleUrl: './status.page.scss',
})
export class StatusPageComponent implements OnInit {
  private readonly api = inject(ApiService);

  protected data: SystemConnectionsStatus | null = null;
  protected loadError: string | null = null;
  protected loading = true;
  protected lastCheckedAt: Date | null = null;
  protected readonly apiUrl = environment.apiUrl || '(nginx proxy: /api)';

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading = true;
    this.loadError = null;
    this.api.getConnectionsStatus().subscribe({
      next: (r) => {
        this.data = r;
        this.lastCheckedAt = new Date();
        this.loading = false;
      },
      error: () => {
        this.data = null;
        this.loading = false;
        this.loadError =
          'Не удалось получить статус. Убедитесь, что API запущен (например docker compose up).';
      },
    });
  }

  protected get overallOk(): boolean {
    return !!(this.data?.postgres.connected && this.data?.redis.connected);
  }

  protected latencyLabel(value: number | null): string {
    if (value === null) return 'n/a';
    if (value < 20) return 'очень быстро';
    if (value < 100) return 'нормально';
    return 'медленно';
  }

  protected connectedCount(): number {
    if (!this.data) return 0;
    let count = 0;
    if (this.data.postgres.connected) count += 1;
    if (this.data.redis.connected) count += 1;
    return count;
  }
}
