import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { CalendarSlotDto } from '../../core/auth/auth.service';
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
  visibleRangeForView,
  weekdayHeaders,
  weekdayShort as ruWeekdayShort,
  weekStartDayToJs,
  workHoursToHourIndices,
} from '../../pages/table-workspace/tabs/calendar-view.utils';

@Component({
  selector: 'app-workspace-calendar-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './workspace-calendar-widget.component.html',
  styleUrl: './workspace-calendar-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceCalendarWidgetComponent {
  readonly slots = input.required<CalendarSlotDto[]>();
  readonly slotsLoading = input(false);
  readonly loadError = input<string | null>(null);

  readonly viewMode = input.required<CalendarViewMode>();
  readonly viewModeChange = output<CalendarViewMode>();

  readonly anchorDate = input.required<Date>();
  readonly anchorChange = output<Date>();
  readonly slotContextMenu = output<{ slot: CalendarSlotDto; clientX: number; clientY: number }>();
  readonly slotDateDrop = output<{ slotId: number; targetDate: string }>();

  readonly weekStartDay = input<string | null>(null);
  readonly workHours = input<string | null>(null);

  /** Акцентные цвета PrimeNG (лендинг / промо). */
  readonly promoTheme = input(false);

  protected readonly weekStartsOn = computed(() => weekStartDayToJs(this.weekStartDay()));

  protected readonly visibleRange = computed(() => {
    const anchor = this.anchorDate();
    const ws = this.weekStartsOn();
    return visibleRangeForView(this.viewMode(), anchor, ws);
  });

  protected readonly slotsByDay = computed(() => {
    const list = this.slots();
    const { from, to } = this.visibleRange();
    return indexSlotsByLocalDay(list, from, to);
  });

  protected readonly periodLabel = computed(() => this.formatPeriodLabel());

  protected readonly monthHeaders = computed(() => weekdayHeaders(this.weekStartsOn()));

  protected readonly monthViewGrid = computed(() => {
    const a = this.anchorDate();
    return buildMonthGrid(a.getFullYear(), a.getMonth(), this.weekStartsOn());
  });

  protected readonly workHourIndices = computed(() => workHoursToHourIndices(this.workHours()));

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

  protected monthName(m: number): string {
    return ruMonthName(m);
  }

  protected weekdayShort(d: number): string {
    return ruWeekdayShort(d);
  }

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
    return this.slotsForDayKey(this.dayKey(anchor)).filter((s) => slotIntersectsHour(s, anchor, hour));
  }

  protected daySlots(): CalendarSlotDto[] {
    return this.slotsForDayKey(this.dayKey(this.anchorDate()));
  }

  protected onViewModeChange(ev: Event): void {
    const v = (ev.target as HTMLSelectElement).value as CalendarViewMode;
    if (v === 'year' || v === 'month' || v === 'week' || v === 'day') {
      this.viewModeChange.emit(v);
    }
  }

  protected prevPeriod(): void {
    this.emitAnchorShift(-1);
  }

  protected nextPeriod(): void {
    this.emitAnchorShift(1);
  }

  protected goToday(): void {
    this.anchorChange.emit(new Date());
  }

  protected pickDay(d: Date): void {
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    this.anchorChange.emit(next);
    this.viewModeChange.emit('day');
  }

  protected dayKey(d: Date): string {
    return dayKeyLocal(d);
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

  protected yearDayTooltip(d: Date): string {
    const items = this.slotsForDayKey(this.dayKey(d));
    if (items.length === 0) {
      return 'Слотов нет';
    }
    const lines = items.slice(0, 4).map((slot) => `${this.formatTimeRange(slot)} ${slot.title}`);
    if (items.length > 4) {
      lines.push(`...и еще ${items.length - 4}`);
    }
    return lines.join('\n');
  }

  protected onSlotContextMenu(event: MouseEvent, slot: CalendarSlotDto): void {
    event.preventDefault();
    this.slotContextMenu.emit({ slot, clientX: event.clientX, clientY: event.clientY });
  }

  protected onSlotDragStart(event: DragEvent, slot: CalendarSlotDto): void {
    if (!event.dataTransfer) {
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(slot.id));
  }

  protected onDropOnDate(event: DragEvent, date: Date): void {
    event.preventDefault();
    const data = event.dataTransfer?.getData('text/plain');
    const slotId = Number(data);
    if (!Number.isFinite(slotId)) {
      return;
    }
    this.slotDateDrop.emit({ slotId, targetDate: dayKeyLocal(date) });
  }

  protected allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  /** По префиксу заголовка (демо: смена / заказ / поручение). */
  protected slotKindClass(s: CalendarSlotDto): string {
    const t = s.title.trim().toLowerCase();
    if (t.startsWith('смена')) {
      return 'tw-cal-slot tw-cal-slot--shift';
    }
    if (t.startsWith('заказ')) {
      return 'tw-cal-slot tw-cal-slot--order';
    }
    if (t.startsWith('поручение')) {
      return 'tw-cal-slot tw-cal-slot--duty';
    }
    return 'tw-cal-slot tw-cal-slot--neutral';
  }

  private emitAnchorShift(dir: number): void {
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
    this.anchorChange.emit(next);
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

  private formatDayTitle(d: Date): string {
    return `${this.weekdayShort(d.getDay())}, ${d.getDate()} ${this.monthName(d.getMonth())} ${d.getFullYear()}`;
  }
}
