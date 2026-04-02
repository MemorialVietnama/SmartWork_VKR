import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';

import { AuthService } from '../../../core/auth/auth.service';
import { TableWorkspaceState } from '../table-workspace.state';

@Component({
  selector: 'app-workspace-calendar-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, ButtonModule, InputTextModule],
  templateUrl: './workspace-calendar.tab.html',
})
export class WorkspaceCalendarTabComponent implements OnInit {
  private readonly auth = inject(AuthService);
  protected readonly state = inject(TableWorkspaceState);

  protected slots: { id: number; title: string; starts_at: string; ends_at: string }[] = [];
  protected loadError: string | null = null;
  protected newTitle = '';
  protected newStart = '';
  protected newEnd = '';
  protected actionError: string | null = null;

  ngOnInit(): void {
    this.refresh();
  }

  protected refresh(): void {
    const id = this.state.tableId();
    this.loadError = null;
    this.auth.listCalendarSlots(id).subscribe({
      next: (data) => {
        this.slots = data;
      },
      error: () => {
        this.loadError = 'Не удалось загрузить слоты.';
      },
    });
  }

  protected addSlot(): void {
    const id = this.state.tableId();
    this.actionError = null;
    const title = this.newTitle.trim();
    if (!title || !this.newStart || !this.newEnd) {
      this.actionError = 'Заполните название и время.';
      return;
    }
    const starts_at = new Date(this.newStart).toISOString();
    const ends_at = new Date(this.newEnd).toISOString();
    this.auth.createCalendarSlot(id, { title, starts_at, ends_at }).subscribe({
      next: () => {
        this.newTitle = '';
        this.refresh();
      },
      error: (err) => {
        this.actionError = err?.error?.detail ?? 'Не удалось создать слот.';
      },
    });
  }

  protected removeSlot(slotId: number): void {
    const id = this.state.tableId();
    this.auth.deleteCalendarSlot(id, slotId).subscribe({
      next: () => this.refresh(),
      error: (err) => {
        this.actionError = err?.error?.detail ?? 'Не удалось удалить.';
      },
    });
  }
}
