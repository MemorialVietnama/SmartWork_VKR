import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';

import { AuthService, InviteInfoDto } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-invite-register',
  standalone: true,
  imports: [FormsModule, CardModule, ButtonModule, InputTextModule, MessageModule],
  templateUrl: './invite-register.page.html',
  styleUrl: './invite-register.page.scss',
})
export class InviteRegisterPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected code = '';
  protected inviteInfo: InviteInfoDto | null = null;

  protected firstName = '';
  protected lastName = '';
  protected middleName = '';
  protected birthDate = '';
  protected phone = '';
  protected email = '';
  protected avatarDataUrl = '';

  protected loading = false;
  protected error: string | null = null;
  protected done = false;

  ngOnInit(): void {
    this.code = this.route.snapshot.queryParamMap.get('code') ?? '';
    if (!this.code) {
      this.error = 'Некорректная ссылка приглашения.';
      return;
    }
    this.auth.inviteInfo(this.code).subscribe({
      next: (info) => {
        this.inviteInfo = info;
      },
      error: (e) => {
        this.error = e?.error?.detail || 'Инвайт недоступен.';
      },
    });
  }

  protected submit(): void {
    if (!this.code || this.loading) return;
    this.error = null;
    this.loading = true;
    this.auth
      .registerByInvite(this.code, {
        last_name: this.lastName.trim(),
        first_name: this.firstName.trim(),
        middle_name: this.middleName.trim() || null,
        birth_date: this.birthDate,
        phone: this.phone.trim(),
        email: this.email.trim().toLowerCase(),
        avatar_data_url: this.avatarDataUrl || null,
      })
      .subscribe({
        next: (resp) => {
          this.loading = false;
          this.done = true;
          void this.router.navigate(['/auth/verify'], { queryParams: { login: resp.login } });
        },
        error: (e) => {
          this.loading = false;
          const detail = e?.error?.detail;
          if (Array.isArray(detail) && detail[0]?.msg) {
            this.error = detail[0].msg;
          } else {
            this.error = detail || 'Не удалось зарегистрироваться по приглашению.';
          }
        },
      });
  }

  protected onAvatarFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.avatarDataUrl = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.readAsDataURL(file);
  }

}

