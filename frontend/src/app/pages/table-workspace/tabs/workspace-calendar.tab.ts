import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, distinctUntilChanged, finalize, of, switchMap, tap } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';

import { AuthService, CalendarSlotDto } from '../../../core/auth/auth.service';
import { TableWorkspaceState } from '../table-workspace.state';
import {
  addDays,
  addMonths,
  addYears,
  buildMonthGrid,
  CalendarViewMode,
  dayKeyLocal,
  endOfWeek,
  indexSlotsByLocalDay,
  monthName as ruMonthName,
  slotIntersectsHour,
  startOfWeek,
  toIsoRange,
  visibleRangeForView,
  weekdayHeaders,
  weekdayShort as ruWeekdayShort,
  weekStartDayToJs,
  workHoursToHourIndices,
} from './calendar-view.utils';

@Component({
  selector: 'app-workspace-calendar-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, CardModule, ButtonModule, InputTextModule],
  templateUrl: './workspace-calendar.tab.html',
  styleUrl: './workspace-calendar.tab.scss',
})
export class WorkspaceCalendarTabComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly state = inject(TableWorkspaceState);

  protected readonly viewMode = signal<CalendarViewMode>('month');
  /** Опорная дата; при смене всегда новый объект Date */
  protected readonly anchorDate = signal<Date>(new Date());

  protected readonly slots = signal<CalendarSlotDto[]>([]);
  protected readonly slotsLoading = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected newTitle = '';
  protected newStart = '';
  protected newEnd = '';
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
    return {
      tableId: id,
      from: from.toISOString(),
      to: to.toISOString(),
    };
  });

  protected readonly slotsByDay = computed(() => {
    const list = this.slots();
    const { from, to } = this.visibleRange();
    return indexSlotsByLocalDay(list, from, to);
  });

  protected readonly periodLabel = computed(() => this.formatPeriodLabel());

  protected monthName(m: number): string {
    return ruMonthName(m);
  }

  protected weekdayShort(d: number): string {
    return ruWeekdayShort(d);
  }

  protected readonly monthHeaders = computed(() => weekdayHeaders(this.weekStartsOn()));

  protected readonly monthViewGrid = computed(() => {
    const a = this.anchorDate();
    return buildMonthGrid(a.getFullYear(), a.getMonth(), this.weekStartsOn());
  });

  protected readonly workHourIndices = computed(() =>
    workHoursToHourIndices(this.state.detail()?.work_hours ?? null),
  );

  ngOnInit(): void {
    toObservable(this.loadKey)
      .pipe(
        distinctUntilChanged(
          (a, b) => a.tableId === b.tableId && a.from === b.from && a.to === b.to,
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
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((data) => this.slots.set(data));
  }

  protected onViewModeChange(ev: Event): void {
    const v = (ev.target as HTMLSelectElement).value as CalendarViewMode;
    if (v === 'year' || v === 'month' || v === 'week' || v === 'day') {
      this.viewMode.set(v);
    }
  }

  protected prevPeriod(): void {
    this.shiftAnchor(-1);
  }

  protected nextPeriod(): void {
    this.shiftAnchor(1);
  }

  protected goToday(): void {
    this.anchorDate.set(new Date());
  }

  /** Стабильные ключи для @for — в track нельзя ссылаться на внешние ym/ri. */
  protected readonly yearMiniLayout = computed(() => {
    const y = this.anchorDate().getFullYear();
    const ws = this.weekStartsOn();
    const months = Array.from({ length: 12 }, (_, m) => ({ year: y, month: m }));
    return months.map((ym) => {
      const grid = buildMonthGrid(ym.year, ym.month, ws);
      const rows = grid.map((cells, ri) => ({
        rowKey: `${ym.year}-${ym.month}-r${ri}`,
        cells: cells.map((cell, ci) => ({
          cell,
          cellKey: cell
            ? `d-${ym.year}-${ym.month}-${cell.getDate()}`
            : `e-${ym.year}-${ym.month}-${ri}-${ci}`,
        })),
      }));
      return { year: ym.year, month: ym.month, rows };
    });
  });

  protected weekDays(): Date[] {
    const a = this.anchorDate();
    const ws = this.weekStartsOn();
    const start = startOfWeek(a, ws);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }

  protected slotsForDayKey(key: string): CalendarSlotDto[] {
    return this.slotsByDay().get(key) ?? [];
  }

  protected slotsForHour(hour: number): CalendarSlotDto[] {
    const anchor = this.anchorDate();
    return this.slots().filter((s) => slotIntersectsHour(s, anchor, hour));
  }

  protected pickDay(d: Date): void {
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    this.anchorDate.set(next);
    this.viewMode.set('day');
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

  protected dayKey(d: Date): string {
    return dayKeyLocal(d);
  }

  protected formatDayTitle(d: Date): string {
    return `${this.weekdayShort(d.getDay())}, ${d.getDate()} ${this.monthName(d.getMonth())} ${d.getFullYear()}`;
  }

  protected isToday(cell: Date): boolean {
    const n = new Date();
    return (
      cell.getFullYear() === n.getFullYear() &&
      cell.getMonth() === n.getMonth() &&
      cell.getDate() === n.getDate()
    );
  }

  protected formatTimeRange(s: CalendarSlotDto): string {
    const a = new Date(s.starts_at);
    const b = new Date(s.ends_at);
    return `${a.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} — ${b.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }

  private shiftAnchor(dir: number): void {
    const a = this.anchorDate();
    const mode = this.viewMode();
    let next: Date;
    switch (mode) {
      case 'year':
        next = addYears(a, dir);
        break;
      case 'month':
        next = addMonths(a, dir);
        break;
      case 'week':
        next = addDays(a, dir * 7);
        break;
      case 'day':
        next = addDays(a, dir);
        break;
    }
    this.anchorDate.set(next);
  }

  private formatPeriodLabel(): string {
    const a = this.anchorDate();
    const mode = this.viewMode();
    const ws = this.weekStartsOn();
    switch (mode) {
      case 'year':
        return String(a.getFullYear());
      case 'month':
        return `${ruMonthName(a.getMonth())} ${a.getFullYear()}`;
      case 'week': {
        const s = startOfWeek(a, ws);
        const e = endOfWeek(a, ws);
        const sameMonth = s.getMonth() === e.getMonth();
        if (sameMonth) {
          return `${s.getDate()}–${e.getDate()} ${ruMonthName(s.getMonth()).slice(0, 3)}. ${s.getFullYear()}`;
        }
        return `${s.getDate()} ${ruMonthName(s.getMonth()).slice(0, 3)}. – ${e.getDate()} ${ruMonthName(e.getMonth()).slice(0, 3)}. ${e.getFullYear()}`;
      }
      case 'day':
        return this.formatDayTitle(a);
    }
  }
}
