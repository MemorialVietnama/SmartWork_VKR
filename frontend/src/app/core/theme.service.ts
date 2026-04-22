import { Injectable } from '@angular/core';

export type AppThemeMode = 'light' | 'dark' | 'auto';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'smartwork_theme_preference';
  private readonly mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.mediaQuery.addEventListener('change', () => {
      if (this.getStoredTheme() === 'auto') {
        this.applyTheme('auto');
      }
    });
  }

  initFromStorage(): void {
    this.applyTheme(this.getStoredTheme());
  }

  applyTheme(theme: AppThemeMode): void {
    localStorage.setItem(this.storageKey, theme);
    const resolved = theme === 'auto' ? (this.mediaQuery.matches ? 'dark' : 'light') : theme;
    const root = document.documentElement;
    root.classList.toggle('sw-dark', resolved === 'dark');
    root.setAttribute('data-theme', resolved);
    root.style.colorScheme = resolved;
  }

  getStoredTheme(): AppThemeMode {
    const raw = localStorage.getItem(this.storageKey);
    return raw === 'light' || raw === 'dark' || raw === 'auto' ? raw : 'auto';
  }
}
