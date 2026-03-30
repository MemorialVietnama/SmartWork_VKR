import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface ConnectionStatusDto {
  connected: boolean;
  latency_ms: number | null;
  error: string | null;
}

export interface SystemConnectionsStatus {
  postgres: ConnectionStatusDto;
  redis: ConnectionStatusDto;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  private url(path: string): string {
    const base = environment.apiUrl.replace(/\/$/, '');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
  }

  getHealth(): Observable<{ status: string; message?: string }> {
    return this.http.get<{ status: string; message?: string }>(this.url('/health'));
  }

  getConnectionsStatus(): Observable<SystemConnectionsStatus> {
    return this.http.get<SystemConnectionsStatus>(this.url('/api/v1/system/status'));
  }
}
