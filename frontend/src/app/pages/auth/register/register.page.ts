import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    CardModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    SelectModule,
    IconField,
    InputIcon,
  ],
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
  protected roleOptions: Array<{ label: string; value: 'owner' | 'staff'; icon: string }> = [
    { label: '????????', value: 'owner', icon: 'pi pi-briefcase' },
    { label: '?????????', value: 'staff', icon: 'pi pi-users' },
  ];

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

    const first = this.firstName.trim();
    const last = this.lastName.trim();
    const email = this.login.trim();

    if (!first || !last || !email || !this.password || !this.confirmPassword) {
      this.error = 'Введите имя, фамилию, email и пароль.';
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.error = 'Пароли не совпадают.';
      return;
    }

    if (!this.passwordRulesOk()) {
      this.error = 'Пароль должен содержать 8 символов, заглавные буквы, маленькие буквы, цифры и специальные символы.';
      return;
    }

    this.loading = true;
    this.auth
      .registerRequestCode({
        first_name: first,
        last_name: last,
        login: email,
        password: this.password,
        password_confirm: this.confirmPassword,
        role: this.role,
      })
      .subscribe({
        next: (resp) => {
          this.loading = false;
          this.message = resp.detail;
          void this.router.navigate(['/auth/verify'], {
            queryParams: { login: email },
          });
        },
        error: (e) => {
          this.loading = false;
          this.error = e?.error?.detail ?? 'Не удалось зарегистрироваться. Попробуйте ещё раз.';
        },
      });
  }
}
