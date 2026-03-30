import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface MeDto {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  login: string;
  role: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly TOKEN_KEY = 'smartwork_access_token';

  private url(path: string): string {
    const base = environment.apiUrl.replace(/\/$/, '');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
  }

  get accessToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.accessToken;
  }

  private authHeaders(): HttpHeaders {
    const token = this.accessToken;
    return new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {});
  }

  registerRequestCode(payload: {
    first_name: string;
    last_name: string;
    login: string;
    password: string;
    password_confirm: string;
    role: 'owner' | 'staff';
  }): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(this.url('/api/v1/auth/register/request-code'), payload);
  }

  registerConfirm(login: string, code: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(this.url('/api/v1/auth/register/confirm'), { login, code });
  }

  resendRegisterCode(login: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(this.url('/api/v1/auth/register/resend-code'), { login });
  }

  login(login: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(this.url('/api/v1/auth/login'), { login, password });
  }

  forgotPassword(login: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(this.url('/api/v1/auth/forgot-password'), { login });
  }

  resetPassword(token: string, newPassword: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(this.url('/api/v1/auth/reset-password'), {
      token,
      new_password: newPassword,
    });
  }

  socialLogin(provider: string): Observable<AuthResponse> {
    return this.http.get<AuthResponse>(this.url(`/api/v1/auth/oauth/${provider}`));
  }

  me(): Observable<MeDto> {
    return this.http.get<MeDto>(this.url('/api/v1/auth/me'), { headers: this.authHeaders() });
  }

  saveToken(resp: AuthResponse): void {
    localStorage.setItem(this.TOKEN_KEY, resp.access_token);
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    void this.router.navigate(['/auth/login']);
  }
}

