import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { PasswordModule } from 'primeng/password';
import { MessageModule } from 'primeng/message';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-reset',
  standalone: true,
  imports: [FormsModule, CardModule, ButtonModule, PasswordModule, MessageModule, InputTextModule, ProgressSpinnerModule],
  templateUrl: './reset.page.html',
  styleUrl: './reset.page.scss',
})
export class ResetPasswordPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected token: string | null = null;
  protected newPassword = '';

  protected loading = false;
  protected message: string | null = null;
  protected error: string | null = null;

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token');
  }

  protected onSubmit(): void {
    if (!this.token) {
      this.error = 'Токен сброса пароля отсутствует.';
      return;
    }
    this.loading = true;
    this.message = null;
    this.error = null;

    this.auth.resetPassword(this.token, this.newPassword).subscribe({
      next: (r) => {
        this.message = r.detail;
        this.loading = false;
      },
      error: (e) => {
        this.loading = false;
        this.error = e?.error?.detail ?? 'Не удалось изменить пароль.';
      },
    });
  }

  protected back(): void {
    void this.router.navigate(['/auth/login']);
  }
}

