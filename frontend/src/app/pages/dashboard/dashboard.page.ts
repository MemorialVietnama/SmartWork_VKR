import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { RouterLink } from '@angular/router';

import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { AuthService, MeDto } from '../../core/auth/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, CardModule, ButtonModule, TagModule, MessageModule, ProgressSpinnerModule],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected user: MeDto | null = null;
  protected loading = true;
  protected error: string | null = null;

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading = true;
    this.error = null;
    this.user = null;

    this.auth.me().subscribe({
      next: (u) => {
        this.user = u;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = 'Сессия не действительна. Выполните вход заново.';
      },
    });
  }

  protected logout(): void {
    this.auth.logout();
  }
}

