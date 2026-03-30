import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { MessageModule } from 'primeng/message';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, CardModule, ButtonModule, InputTextModule, PasswordModule, MessageModule],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected login = '';
  protected password = '';

  protected loading = false;
  protected error: string | null = null;

  protected onLogin(): void {
    if (this.loading) return;
    this.error = null;
    this.loading = true;

    this.auth.login(this.login, this.password).subscribe({
      next: (resp) => {
        this.auth.saveToken(resp);
        void this.router.navigate(['/dashboard']);
      },
      error: (e) => {
        this.loading = false;
        const detail = e?.error?.detail;
        if (detail?.code === 'ACCOUNT_NOT_ACTIVATED') {
          void this.router.navigate(['/auth/verify'], {
            queryParams: { login: detail?.login ?? this.login },
          });
          return;
        }
        this.error = detail ?? 'Не удалось войти. Проверьте логин/пароль.';
      },
    });
  }

  protected onSocial(provider: 'vk' | 'yandex' | 'mailru' | 'google'): void {
    if (this.loading) return;
    this.error = null;
    this.loading = true;

    this.auth.socialLogin(provider).subscribe({
      next: (resp) => {
        this.auth.saveToken(resp);
        void this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.loading = false;
        this.error = 'Социальный вход временно недоступен.';
      },
    });
  }

  protected forgot(): void {
    void this.router.navigate(['/auth/forgot-password']);
  }
}

