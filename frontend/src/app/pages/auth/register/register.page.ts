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
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink, CardModule, ButtonModule, InputTextModule, PasswordModule, MessageModule],
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
})
export class RegisterPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected firstName = '';
  protected lastName = '';
  protected login = '';
  protected password = '';
  protected confirmPassword = '';
  protected role: 'owner' | 'staff' = 'owner';

  protected loading = false;
  protected error: string | null = null;
  protected message: string | null = null;

  private passwordRulesOk(): boolean {
    const p = this.password;
    if (p.length < 8) return false;
    if (!/[A-Z]/.test(p)) return false;
    if (!/[a-z]/.test(p)) return false;
    if (!/\d/.test(p)) return false;
    if (!/[^A-Za-z0-9]/.test(p)) return false;
    return true;
  }

  protected onRegister(): void {
    if (this.loading) return;
    this.error = null;
    this.message = null;

    if (this.password !== this.confirmPassword) {
      this.error = 'Пароли не совпадают.';
      return;
    }
    if (!this.passwordRulesOk()) {
      this.error =
        'Пароль должен быть минимум 8 символов и содержать заглавную, строчную букву, цифру и спецсимвол.';
      return;
    }

    this.loading = true;
    this.auth
      .registerRequestCode({
        first_name: this.firstName,
        last_name: this.lastName,
        login: this.login,
        password: this.password,
        password_confirm: this.confirmPassword,
        role: this.role,
      })
      .subscribe({
      next: (resp) => {
        this.loading = false;
        this.message = resp.detail;
        void this.router.navigate(['/auth/verify'], {
          queryParams: { login: this.login },
        });
      },
      error: (e) => {
        this.loading = false;
        this.error = e?.error?.detail ?? 'Не удалось зарегистрироваться.';
      },
    });
  }
}

