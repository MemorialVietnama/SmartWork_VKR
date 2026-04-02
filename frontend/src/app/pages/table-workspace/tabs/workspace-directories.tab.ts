import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';

import { AuthService } from '../../../core/auth/auth.service';
import { TableWorkspaceState } from '../table-workspace.state';

@Component({
  selector: 'app-workspace-directories-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, ButtonModule, InputTextModule],
  templateUrl: './workspace-directories.tab.html',
})
export class WorkspaceDirectoriesTabComponent implements OnInit {
  private readonly auth = inject(AuthService);
  protected readonly state = inject(TableWorkspaceState);

  protected dirs: { id: number; name: string; items: { id: number; label: string; value: string | null }[] }[] = [];
  protected newDirName = '';
  protected itemLabels: Record<number, string> = {};
  protected itemValues: Record<number, string> = {};
  protected err: string | null = null;

  ngOnInit(): void {
    this.refresh();
  }

  protected get canEdit(): boolean {
    return !!this.state.detail()?.can_edit_settings;
  }

  /** Лимит справочников: минимум 1 без бонуса; бонус увеличивает слоты. */
  protected get maxDirs(): number {
    return Math.max(this.state.bonusQty('extra_directories'), 1);
  }

  protected refresh(): void {
    this.err = null;
    this.auth.listWorkspaceDirectories(this.state.tableId()).subscribe({
      next: (d) => (this.dirs = d),
      error: () => (this.err = 'Не удалось загрузить справочники.'),
    });
  }

  protected addDirectory(): void {
    const name = this.newDirName.trim();
    if (!name) return;
    this.auth.createWorkspaceDirectory(this.state.tableId(), name).subscribe({
      next: () => {
        this.newDirName = '';
        this.refresh();
      },
      error: (e) => (this.err = e?.error?.detail ?? 'Ошибка'),
    });
  }

  protected addItem(dirId: number): void {
    const label = (this.itemLabels[dirId] ?? '').trim();
    if (!label) return;
    const value = (this.itemValues[dirId] ?? '').trim() || null;
    this.auth.addWorkspaceDirectoryItem(this.state.tableId(), dirId, { label, value }).subscribe({
      next: () => {
        this.itemLabels[dirId] = '';
        this.itemValues[dirId] = '';
        this.refresh();
      },
      error: (e) => (this.err = e?.error?.detail ?? 'Ошибка'),
    });
  }

  protected removeDir(dirId: number): void {
    this.auth.deleteWorkspaceDirectory(this.state.tableId(), dirId).subscribe({
      next: () => this.refresh(),
      error: (e) => (this.err = e?.error?.detail ?? 'Ошибка'),
    });
  }
}
