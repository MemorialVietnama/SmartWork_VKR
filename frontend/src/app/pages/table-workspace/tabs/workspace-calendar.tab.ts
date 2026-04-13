import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, distinctUntilChanged, finalize, of, switchMap, tap } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';

import { AuthService, CalendarSlotDto } from '../../../core/auth/auth.service';
import { WorkspaceCalendarWidgetComponent } from '../../../shared/workspace-calendar-widget/workspace-calendar-widget.component';
import { TableWorkspaceState } from '../table-workspace.state';
import { CalendarViewMode, toIsoRange, visibleRangeForView, weekStartDayToJs } from './calendar-view.utils';

@Component({
  selector: 'app-workspace-calendar-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    WorkspaceCalendarWidgetComponent,
  ],
  templateUrl: './workspace-calendar.tab.html',
  styleUrl: './workspace-calendar.tab.scss',
})
export class WorkspaceCalendarTabComponent {
  private readonly auth = inject(AuthService);
  protected readonly state = inject(TableWorkspaceState);

  protected readonly viewMode = signal<CalendarViewMode>('month');
  /** Опорная дата; при смене всегда новый объект Date */
  protected readonly anchorDate = signal<Date>(new Date());

  protected readonly slots = signal<CalendarSlotDto[]>([]);
  protected readonly slotsLoading = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected createDialogVisible = false;
  protected createStep = 1;
  protected newTitle = '';
  protected newSelectedEmployeeIds: number[] = [];
  protected newDateFrom = '';
  protected newTimeFrom = '09:00';
  protected newDateTo = '';
  protected newTimeTo = '18:00';
  protected editDialogVisible = false;
  protected editingSlotId: number | null = null;
  protected editTitle = '';
  protected editStart = '';
  protected editEnd = '';
  protected slotMenuVisible = false;
  protected slotMenuX = 0;
  protected slotMenuY = 0;
  protected selectedSlot: CalendarSlotDto | null = null;
  protected actionError: string | null = null;

  protected readonly weekStartsOn = computed(() => weekStartDayToJs(this.state.detail()?.week_start_day));

  protected readonly visibleRange = computed(() => {
    const anchor = this.anchorDate();
    const ws = this.weekStartsOn();
    return visibleRangeForView(this.viewMode(), anchor, ws);
  });

  protected readonly loadKey = computed(() => {
    const id = this.state.tableId();
    const { from, to } = this.visibleRange();
    const reloadTick = this.state.calendarReloadTick();
    return {
      tableId: id,
      from: from.toISOString(),
      to: to.toISOString(),
      reloadTick,
    };
  });

  constructor() {
    toObservable(this.loadKey)
      .pipe(
        distinctUntilChanged(
          (a, b) =>
            a.tableId === b.tableId &&
            a.from === b.from &&
            a.to === b.to &&
            a.reloadTick === b.reloadTick,
        ),
        tap(() => {
          this.loadError.set(null);
          this.slotsLoading.set(true);
        }),
        switchMap(({ tableId, from, to }) => {
          if (!tableId) {
            this.slotsLoading.set(false);
            return of<CalendarSlotDto[]>([]);
          }
          return this.auth.listCalendarSlots(tableId, from, to).pipe(
            catchError(() => {
              this.loadError.set('Не удалось загрузить слоты за выбранный период.');
              return of<CalendarSlotDto[]>([]);
            }),
            finalize(() => this.slotsLoading.set(false)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((data) => this.slots.set(data));
  }

  protected onCalendarAnchorChange(d: Date): void {
    this.anchorDate.set(new Date(d.getTime()));
  }

  protected openCreateSlotDialog(): void {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    this.createDialogVisible = true;
    this.createStep = 1;
    this.newTitle = '';
    this.newSelectedEmployeeIds = [];
    this.newDateFrom = this.toDateInputValue(now);
    this.newDateTo = this.toDateInputValue(tomorrow);
    this.newTimeFrom = '09:00';
    this.newTimeTo = '18:00';
    this.actionError = null;
  }

  protected closeCreateSlotDialog(): void {
    this.createDialogVisible = false;
  }

  protected nextCreateStep(): void {
    if (this.createStep === 1 && this.newTitle.trim().length < 2) {
      this.actionError = 'Название слота должно содержать минимум 2 символа.';
      return;
    }
    if (this.createStep < 3) {
      this.actionError = null;
      this.createStep += 1;
    }
  }

  protected prevCreateStep(): void {
    if (this.createStep > 1) {
      this.actionError = null;
      this.createStep -= 1;
    }
  }

  protected refresh(): void {
    const id = this.state.tableId();
    const { from, to } = this.visibleRange();
    if (!id) {
      return;
    }
    const { from: f, to: t } = toIsoRange(from, to);
    this.slotsLoading.set(true);
    this.loadError.set(null);
    this.auth
      .listCalendarSlots(id, f, t)
      .pipe(finalize(() => this.slotsLoading.set(false)))
      .subscribe({
        next: (data) => this.slots.set(data),
        error: () => this.loadError.set('Не удалось загрузить слоты.'),
      });
  }

  protected addSlot(): void {
    const id = this.state.tableId();
    this.actionError = null;
    const title = this.newTitle.trim();
    if (!title || !this.newDateFrom || !this.newDateTo || !this.newTimeFrom || !this.newTimeTo) {
      this.actionError = 'Заполните название и время.';
      return;
    }
    const starts_at = new Date(`${this.newDateFrom}T${this.newTimeFrom}`).toISOString();
    const ends_at = new Date(`${this.newDateTo}T${this.newTimeTo}`).toISOString();
    const employeeNames = this.state.members()
      .filter((member) => this.newSelectedEmployeeIds.includes(member.user_id))
      .map((member) => member.short_name);
    const fullTitle = employeeNames.length > 0 ? `${title} (${employeeNames.join(', ')})` : title;
    this.auth.createCalendarSlot(id, { title: fullTitle, starts_at, ends_at }).subscribe({
      next: () => {
        this.createDialogVisible = false;
        this.newTitle = '';
        this.newSelectedEmployeeIds = [];
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

  protected onSlotContextMenu(payload: { slot: CalendarSlotDto; clientX: number; clientY: number }): void {
    this.selectedSlot = payload.slot;
    this.slotMenuX = payload.clientX;
    this.slotMenuY = payload.clientY;
    this.slotMenuVisible = true;
  }

  protected closeSlotMenu(): void {
    this.slotMenuVisible = false;
  }

  protected openEditSlotDialog(): void {
    if (!this.selectedSlot) {
      return;
    }
    this.editingSlotId = this.selectedSlot.id;
    this.editTitle = this.selectedSlot.title;
    this.editStart = this.toDateTimeLocalValue(this.selectedSlot.starts_at);
    this.editEnd = this.toDateTimeLocalValue(this.selectedSlot.ends_at);
    this.editDialogVisible = true;
    this.slotMenuVisible = false;
  }

  protected saveEditedSlot(): void {
    const tableId = this.state.tableId();
    if (!this.editingSlotId) {
      return;
    }
    const title = this.editTitle.trim();
    if (!title || !this.editStart || !this.editEnd) {
      this.actionError = 'Заполните название и время слота.';
      return;
    }
    this.auth
      .updateCalendarSlot(tableId, this.editingSlotId, {
        title,
        starts_at: new Date(this.editStart).toISOString(),
        ends_at: new Date(this.editEnd).toISOString(),
      })
      .subscribe({
        next: () => {
          this.editDialogVisible = false;
          this.editingSlotId = null;
          this.refresh();
        },
        error: (err) => {
          this.actionError = err?.error?.detail ?? 'Не удалось обновить слот.';
        },
      });
  }

  protected deleteSelectedSlot(): void {
    if (!this.selectedSlot) {
      return;
    }
    const id = this.selectedSlot.id;
    this.slotMenuVisible = false;
    this.removeSlot(id);
  }

  protected onSlotDateDrop(payload: { slotId: number; targetDate: string }): void {
    const slot = this.slots().find((item) => item.id === payload.slotId);
    if (!slot) {
      return;
    }
    const startsAt = new Date(slot.starts_at);
    const endsAt = new Date(slot.ends_at);
    const durationMs = endsAt.getTime() - startsAt.getTime();
    const [year, month, day] = payload.targetDate.split('-').map(Number);
    const targetStart = new Date(year, month - 1, day, startsAt.getHours(), startsAt.getMinutes(), 0, 0);
    const targetEnd = new Date(targetStart.getTime() + durationMs);
    this.auth
      .updateCalendarSlot(this.state.tableId(), slot.id, {
        starts_at: targetStart.toISOString(),
        ends_at: targetEnd.toISOString(),
      })
      .subscribe({
        next: () => {
          this.refresh();
        },
        error: (err) => {
          this.actionError = err?.error?.detail ?? 'Не удалось перенести слот.';
        },
      });
  }

  protected toggleEmployeeSelection(userId: number, checked: boolean): void {
    if (checked) {
      if (!this.newSelectedEmployeeIds.includes(userId)) {
        this.newSelectedEmployeeIds = [...this.newSelectedEmployeeIds, userId];
      }
      return;
    }
    this.newSelectedEmployeeIds = this.newSelectedEmployeeIds.filter((id) => id !== userId);
  }

  protected activeEmployeeNames(): string[] {
    return this.state.members()
      .filter((member) => this.newSelectedEmployeeIds.includes(member.user_id))
      .map((member) => member.short_name);
  }

  private toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toDateTimeLocalValue(valueIso: string): string {
    const value = new Date(valueIso);
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    const hours = `${value.getHours()}`.padStart(2, '0');
    const minutes = `${value.getMinutes()}`.padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
}
