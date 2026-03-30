import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-forgot',
  standalone: true,
  imports: [FormsModule, CardModule, ButtonModule, InputTextModule, MessageModule, ProgressSpinnerModule],
  templateUrl: './forgot.page.html',
  styleUrl: './forgot.page.scss',
})
export class ForgotPasswordPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected login = '';
  protected loading = false;
  protected message: string | null = null;
  protected error: string | null = null;

  protected onSubmit(): void {
    if (this.loading) return;
    this.loading = true;
    this.message = null;
    this.error = null;

    this.auth.forgotPassword(this.login).subscribe({
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

  protected back(): void {
    void this.router.navigate(['/auth/login']);
  }
}

