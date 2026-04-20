import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';

import { AuthService, TableMemberBriefDto } from '../../../core/auth/auth.service';
import { TableWorkspaceState } from '../table-workspace.state';

interface ShiftForm {
  weekdays: number[];
  startTime: string;
  endTime: string;
  weeksAhead: number;
}

@Component({
  selector: 'app-workspace-employees-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, ButtonModule, InputTextModule],
  templateUrl: './workspace-employees.tab.html',
  styleUrl: './workspace-employees.tab.scss',
})
export class WorkspaceEmployeesTabComponent implements OnInit {
  private readonly auth = inject(AuthService);
  protected readonly state = inject(TableWorkspaceState);

  protected meId: number | null = null;
  protected employeeInfoById: Record<number, { position?: string | null; note?: string | null }> = {};
  protected readonly weekdays = [
    { value: 1, label: 'Пн' },
    { value: 2, label: 'Вт' },
    { value: 3, label: 'Ср' },
    { value: 4, label: 'Чт' },
    { value: 5, label: 'Пт' },
    { value: 6, label: 'Сб' },
    { value: 0, label: 'Вс' },
  ];

  protected forms: Record<number, ShiftForm> = {};
  protected savingByUser: Record<number, boolean> = {};
  protected errorByUser: Record<number, string | null> = {};
  protected successByUser: Record<number, string | null> = {};

  protected readonly members = computed(() => this.state.members().filter((m) => !m.is_owner));

  ngOnInit(): void {
    this.auth.me().subscribe({
      next: (me) => {
        this.meId = me.id;
      },
    });
    this.auth.myEmployees().subscribe({
      next: (employees) => {
        const map: Record<number, { position?: string | null; note?: string | null }> = {};
        for (const employee of employees) {
          map[employee.id] = {
            position: employee.position ?? null,
            note: employee.note ?? null,
          };
        }
        this.employeeInfoById = map;
      },
      error: () => {
        this.employeeInfoById = {};
      },
    });
  }

  protected memberInitials(member: TableMemberBriefDto): string {
    const words = member.short_name
      .split(' ')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const first = words[0]?.[0] ?? '';
    const second = words[1]?.[0] ?? '';
    const value = `${first}${second}`.toUpperCase();
    return value || 'С';
  }

  protected memberDescription(member: TableMemberBriefDto): string {
    const info = this.employeeInfoById[member.user_id];
    const position = info?.position?.trim();
    const note = info?.note?.trim();
    if (position && note) {
      return `${position}. ${note}`;
    }
    if (position) {
      return position;
    }
    if (note) {
      return note;
    }
    return 'Сотрудник стола. Доступно планирование смен и календаря.';
  }

  protected memberColorClass(member: TableMemberBriefDto): string {
    const palette = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
    return palette[member.user_id % palette.length];
  }

  protected ensureForm(userId: number): ShiftForm {
    if (!this.forms[userId]) {
      this.forms[userId] = {
        weekdays: [1, 2, 3, 4, 5],
        startTime: '09:00',
        endTime: '18:00',
        weeksAhead: 4,
      };
    }
    return this.forms[userId];
  }

  protected canEdit(member: TableMemberBriefDto): boolean {
    if (member.is_owner) {
      return false;
    }
    return this.isOwner() || member.user_id === this.meId;
  }

  protected toggleWeekday(userId: number, weekday: number, checked: boolean): void {
    const form = this.ensureForm(userId);
    if (checked) {
      if (!form.weekdays.includes(weekday)) {
        form.weekdays = [...form.weekdays, weekday].sort((a, b) => a - b);
      }
      return;
    }
    form.weekdays = form.weekdays.filter((value) => value !== weekday);
  }

  protected onWeekdayChange(userId: number, weekday: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    this.toggleWeekday(userId, weekday, target.checked);
  }

  protected saveSchedule(member: TableMemberBriefDto): void {
    const form = this.ensureForm(member.user_id);
    this.errorByUser[member.user_id] = null;
    this.successByUser[member.user_id] = null;
    if (!this.canEdit(member)) {
      this.errorByUser[member.user_id] = 'Недостаточно прав для изменения графика.';
      return;
    }
    if (form.weekdays.length === 0) {
      this.errorByUser[member.user_id] = 'Выберите хотя бы один день.';
      return;
    }
    if (!form.startTime || !form.endTime || form.startTime >= form.endTime) {
      this.errorByUser[member.user_id] = 'Проверьте время начала и окончания смены.';
      return;
    }
    if (form.weeksAhead < 1 || form.weeksAhead > 8) {
      this.errorByUser[member.user_id] = 'Горизонт планирования должен быть от 1 до 8 недель.';
      return;
    }

    this.savingByUser[member.user_id] = true;
    const tableId = this.state.tableId();
    if (!tableId) {
      this.savingByUser[member.user_id] = false;
      this.errorByUser[member.user_id] = 'Не удалось определить стол.';
      return;
    }
    this.auth
      .applyShiftSchedule(tableId, {
        employee_user_id: member.user_id,
        weekdays: [...form.weekdays],
        start_time: form.startTime,
        end_time: form.endTime,
        weeks_ahead: form.weeksAhead,
      })
      .pipe(
        timeout(30000),
        finalize(() => {
          this.savingByUser[member.user_id] = false;
        }),
      )
      .subscribe({
      next: (resp) => {
        this.successByUser[member.user_id] =
          `Создано смен: ${resp.created_count}.` +
          (resp.skipped_duplicates > 0 ? ` Пропущено дублей: ${resp.skipped_duplicates}.` : '') +
          ' Они уже добавлены в календарь.';
        this.state.bumpCalendarReload();
      },
      error: (err) => {
        this.errorByUser[member.user_id] = err?.error?.detail ?? 'Не удалось добавить смены в календарь.';
      },
    });
  }

  private isOwner(): boolean {
    return this.state.detail()?.can_edit_settings === true;
  }
}
