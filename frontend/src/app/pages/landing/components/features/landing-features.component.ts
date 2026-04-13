import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TableModule } from 'primeng/table';

import type { CalendarSlotDto } from '../../../../core/auth/auth.service';
import { WorkspaceCalendarWidgetComponent } from '../../../../shared/workspace-calendar-widget/workspace-calendar-widget.component';
import type { CalendarViewMode } from '../../../table-workspace/tabs/calendar-view.utils';
import type { LandingFeatureId, LandingSelectOption } from '../../landing.models';

function buildLandingCalendarDemoSlots(anchor: Date): CalendarSlotDto[] {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  let nid = 900_001;
  const out: CalendarSlotDto[] = [];

  const pushSlot = (
    year: number,
    month: number,
    day: number,
    sh: number,
    sm: number,
    eh: number,
    em: number,
    title: string,
  ): void => {
    const last = new Date(year, month + 1, 0).getDate();
    const d = Math.min(Math.max(day, 1), last);
    const starts = new Date(year, month, d, sh, sm, 0);
    const ends = new Date(year, month, d, eh, em, 0);
    out.push({ id: nid++, title, starts_at: starts.toISOString(), ends_at: ends.toISOString() });
  };

  for (let mo = 0; mo < 12; mo++) {
    pushSlot(y, mo, 10, 11, 0, 11, 45, 'Заказ (демо)');
  }

  const lastDay = new Date(y, m + 1, 0).getDate();
  const today = anchor.getDate();
  const d0 = Math.min(today, lastDay);

  pushSlot(y, m, d0, 9, 0, 13, 0, 'Смена: открытие');
  pushSlot(y, m, d0, 14, 0, 15, 30, 'Заказ №204 — стрижка');
  pushSlot(y, m, d0, 16, 0, 16, 45, 'Поручение: сверка остатков');

  const d1 = Math.min(d0 + 1, lastDay);
  if (d1 > d0) {
    pushSlot(y, m, d1, 10, 0, 14, 0, 'Смена: полный день');
    pushSlot(y, m, d1, 15, 0, 15, 40, 'Заказ №205 — окрашивание');
  }

  const d2 = Math.min(d0 + 3, lastDay);
  if (d2 > d0) {
    pushSlot(y, m, d2, 11, 30, 12, 0, 'Поручение: звонок поставщику');
    pushSlot(y, m, d2, 13, 0, 14, 30, 'Заказ №206');
  }

  const d3 = Math.min(d0 + 5, lastDay);
  if (d3 > d0 && d3 !== d2) {
    pushSlot(y, m, d3, 9, 30, 12, 0, 'Смена: утро');
  }

  const dm = Math.max(1, d0 - 2);
  if (dm < d0) {
    pushSlot(y, m, dm, 10, 0, 11, 0, 'Поручение: отчёт');
  }

  return out;
}

@Component({
  selector: 'app-landing-features',
  standalone: true,
  imports: [TableModule, WorkspaceCalendarWidgetComponent],
  templateUrl: './landing-features.component.html',
  styleUrls: ['../../landing-shared.scss', './landing-features.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingFeaturesComponent {
  readonly featureId = input.required<LandingFeatureId>();
  readonly featureOptions = input.required<LandingSelectOption<LandingFeatureId>[]>();

  readonly featureChange = output<LandingFeatureId>();

  protected readonly calViewMode = signal<CalendarViewMode>('week');
  protected readonly calAnchor = signal<Date>(new Date());

  protected readonly demoCalendarSlots = computed(() => buildLandingCalendarDemoSlots(this.calAnchor()));

  protected readonly serviceDemoRows: { s: string; p: string; t: string }[] = [
    { s: 'Стрижка', p: '500 ₽', t: '30 мин' },
    { s: 'Бритьё', p: '400 ₽', t: '20 мин' },
    { s: 'Уход за бородой', p: '350 ₽', t: '15 мин' },
  ];

  protected selectFeature(id: LandingFeatureId): void {
    this.featureChange.emit(id);
  }
}
