import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    CardModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
  ],
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
    const email = this.login.trim();
    if (!email || !this.password) {
      this.error = 'Введите email и пароль.';
      return;
    }
    this.loading = true;

    this.auth.login(email, this.password).subscribe({
      next: (resp) => {
        this.auth.saveToken(resp);
        void this.router.navigate(['/dashboard']);
      },
      error: (e) => {
        this.loading = false;
        const status = e?.status as number | undefined;
        if (status === 0 || status === 502 || status === 503 || status === 504) {
          this.error =
            'Сервер сейчас недоступен. Подождите немного и попробуйте снова. Если используете Docker — дождитесь состояния healthy у API.';
          return;
        }
        const detail = e?.error?.detail;
        if (detail?.code === 'ACCOUNT_NOT_ACTIVATED') {
          void this.router.navigate(['/auth/verify'], {
            queryParams: { login: detail?.login ?? this.login },
          });
          return;
        }
        const msg = typeof detail === 'string' ? detail : null;
        this.error = msg ?? 'Неверный email или пароль. Проверьте данные и попробуйте ещё раз.';
      },
    });
  }
}
