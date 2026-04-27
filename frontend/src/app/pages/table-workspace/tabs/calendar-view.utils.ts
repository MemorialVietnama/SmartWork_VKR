import { CalendarSlotDto } from '../../../core/auth/auth.service';

export type CalendarViewMode = 'year' | 'month' | 'week' | 'day';

const WEEK_DAY_TO_JS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** JS getDay(): 0=Вс … 6=Сб */
export function weekStartDayToJs(weekStartDay: string | null | undefined): number {
  const k = (weekStartDay ?? 'monday').toLowerCase();
  return WEEK_DAY_TO_JS[k] ?? 1;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}

export function endOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
}

/** Понедельник-первый день недели: weekStartsOn = 1 */
export function startOfWeek(d: Date, weekStartsOn: number): Date {
  const day = d.getDay();
  let diff = day - weekStartsOn;
  if (diff < 0) {
    diff += 7;
  }
  const r = startOfDay(d);
  r.setDate(r.getDate() - diff);
  return r;
}

export function endOfWeek(d: Date, weekStartsOn: number): Date {
  const s = startOfWeek(d, weekStartsOn);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  return endOfDay(e);
}

export function addDays(d: Date, delta: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + delta);
  return r;
}

export function addMonths(d: Date, delta: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + delta);
  return r;
}

export function addYears(d: Date, delta: number): Date {
  const r = new Date(d);
  r.setFullYear(r.getFullYear() + delta);
  return r;
}

export function dayKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function toIsoRange(from: Date, to: Date): { from: string; to: string } {
  return { from: from.toISOString(), to: to.toISOString() };
}

export function visibleRangeForView(
  mode: CalendarViewMode,
  anchor: Date,
  weekStartsOn: number,
): { from: Date; to: Date } {
  switch (mode) {
    case 'year':
      return { from: startOfYear(anchor), to: endOfYear(anchor) };
    case 'month':
      return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    case 'week':
      return { from: startOfWeek(anchor, weekStartsOn), to: endOfWeek(anchor, weekStartsOn) };
    case 'day':
      return { from: startOfDay(anchor), to: endOfDay(anchor) };
  }
}

export interface ParsedWorkHours {
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
}

export function parseWorkHours(wh: string | null | undefined): ParsedWorkHours | null {
  if (!wh || !wh.includes('-')) {
    return null;
  }
  const [a, b] = wh.split('-').map((s) => s.trim());
  const parseHm = (s: string): { hour: number; min: number } | null => {
    const parts = s.split(':');
    const h = Number(parts[0]);
    const m = parts[1] !== undefined ? Number(parts[1]) : 0;
    if (!Number.isFinite(h)) {
      return null;
    }
    return { hour: h, min: Number.isFinite(m) ? m : 0 };
  };
  const start = parseHm(a);
  const end = parseHm(b);
  if (!start || !end) {
    return null;
  }
  return {
    startHour: start.hour,
    startMin: start.min,
    endHour: end.hour,
    endMin: end.min,
  };
}

/** Часы 0–23, для которых интервал [h:00, (h+1):00) пересекает рабочие часы */
export function workHoursToHourIndices(wh: string | null | undefined): number[] {
  const p = parseWorkHours(wh);
  const startM = p ? p.startHour * 60 + p.startMin : 8 * 60;
  const endM = p ? p.endHour * 60 + p.endMin : 20 * 60;
  const out: number[] = [];
  for (let h = 0; h < 24; h++) {
    const hs = h * 60;
    const he = (h + 1) * 60;
    if (hs < endM && he > startM) {
      out.push(h);
    }
  }
  return out;
}

export function slotIntersectsHour(slot: CalendarSlotDto, dayAnchor: Date, hour: number): boolean {
  const dayStart = startOfDay(dayAnchor).getTime();
  const dayEnd = endOfDay(dayAnchor).getTime();
  const hs = hour * 60 * 60 * 1000;
  const he = (hour + 1) * 60 * 60 * 1000;
  const winStart = dayStart + hs;
  const winEnd = dayStart + he;
  const a = new Date(slot.starts_at).getTime();
  const b = new Date(slot.ends_at).getTime();
  return a < winEnd && b > winStart;
}

/** Каждый день, который пересекается со слотом, получает запись (без дубликатов id в дне) */
export function indexSlotsByLocalDay(
  slots: CalendarSlotDto[],
  rangeFrom: Date,
  rangeTo: Date,
): Map<string, CalendarSlotDto[]> {
  const map = new Map<string, CalendarSlotDto[]>();
  const rs = startOfDay(rangeFrom).getTime();
  const re = endOfDay(rangeTo).getTime();

  for (const s of slots) {
    const a = new Date(s.starts_at).getTime();
    const b = new Date(s.ends_at).getTime();
    if (b <= rs || a >= re) {
      continue;
    }
    let cursor = startOfDay(new Date(Math.max(a, rs)));
    const endT = Math.min(b, re);
    while (cursor.getTime() <= endT) {
      const key = dayKeyLocal(cursor);
      const list = map.get(key) ?? [];
      if (!list.some((x) => x.id === s.id)) {
        list.push(s);
      }
      map.set(key, list);
      const next = new Date(cursor);
      next.setDate(next.getDate() + 1);
      cursor = next;
    }
  }

  for (const [, list] of map) {
    list.sort((x, y) => new Date(x.starts_at).getTime() - new Date(y.starts_at).getTime());
  }
  return map;
}

const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function monthName(m: number): string {
  return MONTH_NAMES[m] ?? '';
}

export function weekdayShort(jsDay: number): string {
  return WEEKDAY_SHORT[jsDay] ?? '';
}

/** Подписи колонок: первая колонка = первый день недели стола */
export function weekdayHeaders(weekStartsOn: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    out.push(WEEKDAY_SHORT[(weekStartsOn + i) % 7] ?? '');
  }
  return out;
}

/** 6×7 ячеек: Date в месяце или null (пустая) */
export function buildMonthGrid(year: number, month: number, weekStartsOn: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() - weekStartsOn + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  while (cells.length < 42) {
    cells.push(null);
  }
  const rows: (Date | null)[][] = [];
  for (let r = 0; r < cells.length; r += 7) {
    rows.push(cells.slice(r, r + 7));
  }
  return rows;
}

/** Мини-сетка одного месяца — до 6 строк */
export function buildMonthGridFlat(year: number, month: number, weekStartsOn: number): (Date | null)[] {
  return buildMonthGrid(year, month, weekStartsOn).flat();
}
