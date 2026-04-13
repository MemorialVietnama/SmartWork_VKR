import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-verify',
  standalone: true,
  imports: [FormsModule, RouterLink, CardModule, ButtonModule, InputTextModule, MessageModule],
  templateUrl: './verify.page.html',
  styleUrl: './verify.page.scss',
})
export class VerifyPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected login = '';
  protected code = '';
  protected loading = false;
  protected error: string | null = null;
  protected message: string | null = null;

  ngOnInit(): void {
    this.login = this.route.snapshot.queryParamMap.get('login') ?? '';
  }

  protected confirm(): void {
    if (this.loading) return;
    this.loading = true;
    this.error = null;
    this.message = null;

    this.auth.registerConfirm(this.login, this.code).subscribe({
      next: (resp) => {
        this.auth.saveToken(resp);
        void this.router.navigate(['/dashboard']);
      },
      error: (e) => {
        this.loading = false;
        this.error = e?.error?.detail ?? 'Неверный или просроченный код.';
      },
    });
  }

  protected resend(): void {
    if (this.loading) return;
    this.loading = true;
    this.error = null;
    this.message = null;

    this.auth.resendRegisterCode(this.login).subscribe({
      next: (r) => {
        this.loading = false;
        this.message = r.detail;
      },
      error: (e) => {
        this.loading = false;
        this.error = e?.error?.detail ?? 'Не удалось отправить код повторно.';
      },
    });
  }

  protected codePreviewSlots(): string[] {
    const clean = this.code.replace(/\s+/g, '').slice(0, 6);
    return Array.from({ length: 6 }, (_, index) => clean[index] ?? '•');
  }

  protected normalizedLogin(): string {
    return this.login.trim().toLowerCase();
  }
}

