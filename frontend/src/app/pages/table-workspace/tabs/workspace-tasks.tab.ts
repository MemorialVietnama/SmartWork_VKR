import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';

import { AuthService } from '../../../core/auth/auth.service';
import { TableWorkspaceState } from '../table-workspace.state';

@Component({
  selector: 'app-workspace-tasks-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, ButtonModule, InputTextModule],
  templateUrl: './workspace-tasks.tab.html',
})
export class WorkspaceTasksTabComponent implements OnInit {
  private readonly auth = inject(AuthService);
  protected readonly state = inject(TableWorkspaceState);

  protected tasks: { id: number; title: string; status: string; assignee_user_id: number | null }[] = [];
  protected newTitle = '';
  protected err: string | null = null;

  ngOnInit(): void {
    this.refresh();
  }

  protected get tasksUnlocked(): boolean {
    return this.state.bonusQty('unlock_tasks') > 0;
  }

  protected refresh(): void {
    if (!this.tasksUnlocked) {
      this.tasks = [];
      return;
    }
    this.err = null;
    this.auth.listWorkspaceTasks(this.state.tableId()).subscribe({
      next: (t) => (this.tasks = t),
      error: () => (this.err = 'Не удалось загрузить задачи.'),
    });
  }

  protected addTask(): void {
    const title = this.newTitle.trim();
    if (!title) return;
    this.auth.createWorkspaceTask(this.state.tableId(), { title, status: 'new' }).subscribe({
      next: () => {
        this.newTitle = '';
        this.refresh();
      },
      error: (e) => (this.err = e?.error?.detail ?? 'Ошибка создания'),
    });
  }

  protected cycleStatus(task: { id: number; status: string }): void {
    const order = ['new', 'waiting', 'done'] as const;
    const i = order.indexOf(task.status as (typeof order)[number]);
    const next = order[(i + 1) % order.length];
    this.auth.updateWorkspaceTask(this.state.tableId(), task.id, { status: next }).subscribe({
      next: () => this.refresh(),
      error: (e) => (this.err = e?.error?.detail ?? 'Ошибка'),
    });
  }

  protected removeTask(id: number): void {
    this.auth.deleteWorkspaceTask(this.state.tableId(), id).subscribe({
      next: () => this.refresh(),
      error: (e) => (this.err = e?.error?.detail ?? 'Ошибка'),
    });
  }
}
