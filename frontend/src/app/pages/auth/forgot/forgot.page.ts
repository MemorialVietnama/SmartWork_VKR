import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-forgot',
  standalone: true,
  imports: [FormsModule, RouterLink, CardModule, ButtonModule, InputTextModule, IconField, InputIcon],
  templateUrl: './forgot.page.html',
  styleUrl: './forgot.page.scss',
})
export class ForgotPasswordPageComponent {
  private readonly auth = inject(AuthService);

  protected login = '';
  protected loading = false;
  protected message: string | null = null;
  protected error: string | null = null;

  protected onSubmit(): void {
    if (this.loading) return;

    const email = this.login.trim();
    this.message = null;
    this.error = null;

    if (!email) {
      this.error = 'Введите email.';
      return;
    }

    this.loading = true;
    this.auth.forgotPassword(email).subscribe({
      next: (r) => {
        this.message = r.detail;
        this.loading = false;
      },
      error: () => {
        this.error = 'Не удалось отправить запрос. Попробуйте позже.';
        this.loading = false;
      },
    });
  }
}
