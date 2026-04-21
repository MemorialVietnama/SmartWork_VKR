import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
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
  imports: [TableModule, WorkspaceCalendarWidgetComponent, DragDropModule],
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
  protected readonly directoryCatalogs: LandingDirectoryCatalog[] = [
    {
      key: 'services',
      title: 'Услуги',
      subtitle: 'Прайс, длительность, категория',
      icon: 'pi pi-briefcase',
      kindLabel: 'Шаблон',
      records: [
        { id: 'srv-1', title: 'Стрижка + борода', value: '2 400 ₽', meta: '55 мин' },
        { id: 'srv-2', title: 'Камуфляж седины', value: '1 800 ₽', meta: '40 мин' },
        { id: 'srv-3', title: 'Укладка + уход', value: '1 200 ₽', meta: '25 мин' },
      ],
    },
    {
      key: 'clients',
      title: 'Клиенты',
      subtitle: 'Карточки и история визитов',
      icon: 'pi pi-users',
      kindLabel: 'Шаблон',
      records: [
        { id: 'cl-1', title: 'Алексей Морозов', value: '+7 901 220-11-90', meta: 'Рейтинг 5.0' },
        { id: 'cl-2', title: 'Дмитрий Смирнов', value: '+7 902 442-17-33', meta: 'Рейтинг 4.8' },
        { id: 'cl-3', title: 'Илья Мартынов', value: '+7 905 118-55-12', meta: 'Рейтинг 4.9' },
      ],
    },
    {
      key: 'staff',
      title: 'Сотрудники',
      subtitle: 'Роли, KPI, загрузка',
      icon: 'pi pi-id-card',
      kindLabel: 'Произвольный',
      records: [
        { id: 'st-1', title: 'Иван В.', value: 'Барбер', meta: 'Загрузка 87%' },
        { id: 'st-2', title: 'Мария К.', value: 'Барбер', meta: 'Загрузка 82%' },
        { id: 'st-3', title: 'Ольга П.', value: 'Администратор', meta: 'Смена 5/2' },
      ],
    },
  ];
  protected readonly selectedDirectoryCatalogKey = signal<LandingDirectoryCatalogKey | null>(null);
  protected readonly selectedDirectoryRecordId = signal<string | null>(null);
  protected readonly selectedDirectoryCatalog = computed(
    () => this.directoryCatalogs.find((item) => item.key === this.selectedDirectoryCatalogKey()) ?? null,
  );
  protected readonly taskColumns = signal<LandingTaskColumn[]>([
    {
      key: 'new',
      title: 'Новые',
      accent: 'new',
      tasks: [
        {
          id: 'task-onboarding',
          title: 'Онбординг нового администратора',
          description:
            'Подготовить рабочее место, выдать доступы к CRM и регламентам, провести тестовый прием клиента и сверить чек-лист запуска смены.',
          assignee: 'Екатерина, управляющая',
          priority: 'high',
          dueAt: 'Сегодня, 18:30',
          tags: ['HR', 'Доступы', 'Обучение'],
          checklistDone: 2,
          checklistTotal: 7,
          attachments: 4,
          comments: 6,
        },
      ],
    },
    {
      key: 'waiting',
      title: 'В работе',
      accent: 'waiting',
      tasks: [
        {
          id: 'task-stock',
          title: 'Сверка остатков расходников',
          description:
            'Проверить склад по 18 позициям, отметить критичные остатки, сформировать заказ поставщику и согласовать бюджет на неделю.',
          assignee: 'Денис, старший мастер',
          priority: 'medium',
          dueAt: 'Завтра, 12:00',
          tags: ['Склад', 'Заказ', 'Финансы'],
          checklistDone: 5,
          checklistTotal: 8,
          attachments: 2,
          comments: 3,
        },
      ],
    },
    {
      key: 'done',
      title: 'Готово',
      accent: 'done',
      tasks: [
        {
          id: 'task-loyalty',
          title: 'Запуск акции лояльности',
          description:
            'Настроены правила начисления бонусов, обновлены шаблоны уведомлений и добавлен блок акции на лендинг стола.',
          assignee: 'Ирина, маркетолог',
          priority: 'low',
          dueAt: 'Выполнено сегодня',
          tags: ['Маркетинг', 'Бонусы', 'Коммуникации'],
          checklistDone: 6,
          checklistTotal: 6,
          attachments: 5,
          comments: 9,
        },
      ],
    },
  ]);
  protected readonly taskDropListIds = computed(() => this.taskColumns().map((column) => this.dropListId(column.key)));
  protected readonly analyticsPeriods: { readonly id: string; readonly label: string; readonly active: boolean }[] = [
    { id: '7d', label: '7 дней', active: false },
    { id: '30d', label: '30 дней', active: true },
    { id: '90d', label: '90 дней', active: false },
    { id: '365d', label: '365 дней', active: false },
  ];
  protected readonly analyticsKpis: LandingAnalyticsKpi[] = [
    { key: 'orders', title: 'Заказы', value: '184', delta: '+12.4%' },
    { key: 'revenue', title: 'Выручка', value: '412 800 ₽', delta: '+9.1%' },
    { key: 'avg-check', title: 'Средний чек', value: '2 243 ₽', delta: '+4.8%' },
    { key: 'repeat', title: 'Повторные клиенты', value: '67%', delta: '+6.2%' },
  ];
  protected readonly analyticsCategories: LandingAnalyticsCategory[] = [
    { title: 'Услуги', subtitle: 'Доля в выручке', value: 38, trendBars: [42, 55, 49, 63, 58, 72, 79, 68, 81, 87, 84, 92] },
    { title: 'Продажи', subtitle: 'Конверсия записей', value: 29, trendBars: [35, 39, 45, 51, 48, 57, 61, 59, 66, 72, 70, 78] },
    { title: 'Сотрудники', subtitle: 'Средняя загрузка', value: 24, trendBars: [31, 37, 40, 46, 51, 55, 60, 63, 65, 69, 73, 76] },
    { title: 'Клиенты', subtitle: 'Возвраты и retention', value: 33, trendBars: [28, 34, 39, 45, 47, 53, 57, 61, 64, 67, 72, 75] },
  ];
  protected readonly analyticsSelectedCategory = signal<string>('Услуги');
  protected readonly analyticsSummaryByCategory: Record<string, { readonly label: string; readonly value: string }[]> = {
    'Услуги': [
      { label: 'Пиковый день', value: 'Пятница (39 заказов)' },
      { label: 'Top услуга', value: 'Стрижка + борода (31%)' },
      { label: 'Среднее время заказа', value: '52 мин' },
      { label: 'Отмены', value: '4.3%' },
    ],
    'Продажи': [
      { label: 'Новые лиды', value: '126 за период' },
      { label: 'Конверсия звонков', value: '34%' },
      { label: 'Конверсия онлайн-заявок', value: '42%' },
      { label: 'Средний цикл сделки', value: '1.8 дня' },
    ],
    'Сотрудники': [
      { label: 'Средняя загрузка команды', value: '81%' },
      { label: 'Лидер по выручке', value: 'Иван В. (94 200 ₽)' },
      { label: 'Средний чек команды', value: '2 060 ₽' },
      { label: 'Доля опозданий', value: '2.1%' },
    ],
    'Клиенты': [
      { label: 'Повторные визиты', value: '67%' },
      { label: 'Средний интервал визита', value: '24 дня' },
      { label: 'NPS', value: '72' },
      { label: 'Отток', value: '3.8%' },
    ],
  };
  protected readonly analyticsCurrentCategory = computed(
    () => this.analyticsCategories.find((item) => item.title === this.analyticsSelectedCategory()) ?? this.analyticsCategories[0],
  );
  protected readonly analyticsSummary = computed(
    () => this.analyticsSummaryByCategory[this.analyticsCurrentCategory().title] ?? [],
  );

  protected selectFeature(id: LandingFeatureId): void {
    this.featureChange.emit(id);
  }

  protected dropTask(event: CdkDragDrop<LandingTaskCard[]>, targetColumnKey: LandingTaskColumnKey): void {
    const currentColumns = this.taskColumns();
    const sourceColumnKey = this.columnKeyFromDropListId(event.previousContainer.id);
    if (!sourceColumnKey) {
      return;
    }
    const sourceColumnIndex = currentColumns.findIndex((column) => column.key === sourceColumnKey);
    const targetColumnIndex = currentColumns.findIndex((column) => column.key === targetColumnKey);
    if (sourceColumnIndex < 0 || targetColumnIndex < 0) {
      return;
    }
    const nextColumns = currentColumns.map((column) => ({ ...column, tasks: [...column.tasks] }));
    if (event.previousContainer === event.container) {
      moveItemInArray(nextColumns[targetColumnIndex].tasks, event.previousIndex, event.currentIndex);
      this.taskColumns.set(nextColumns);
      return;
    }
    transferArrayItem(
      nextColumns[sourceColumnIndex].tasks,
      nextColumns[targetColumnIndex].tasks,
      event.previousIndex,
      event.currentIndex,
    );
    this.taskColumns.set(nextColumns);
  }

  protected dropListId(columnKey: LandingTaskColumnKey): string {
    return `landing-task-drop-${columnKey}`;
  }

  protected analyticsBarWidth(value: number): string {
    const normalized = Math.max(8, Math.min(100, value));
    return `${normalized}%`;
  }

  protected selectAnalyticsCategory(title: string): void {
    this.analyticsSelectedCategory.set(title);
  }

  protected openDirectoryCatalog(key: LandingDirectoryCatalogKey): void {
    this.selectedDirectoryCatalogKey.set(key);
    this.selectedDirectoryRecordId.set(null);
  }

  protected closeDirectoryCatalog(): void {
    this.selectedDirectoryCatalogKey.set(null);
    this.selectedDirectoryRecordId.set(null);
  }

  protected selectDirectoryRecord(recordId: string): void {
    this.selectedDirectoryRecordId.set(recordId);
  }

  private columnKeyFromDropListId(dropListId: string): LandingTaskColumnKey | null {
    const key = dropListId.replace('landing-task-drop-', '');
    if (key === 'new' || key === 'waiting' || key === 'done') {
      return key;
    }
    return null;
  }
}

type LandingTaskColumnKey = 'new' | 'waiting' | 'done';

interface LandingTaskCard {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly assignee: string;
  readonly priority: 'low' | 'medium' | 'high';
  readonly dueAt: string;
  readonly tags: readonly string[];
  readonly checklistDone: number;
  readonly checklistTotal: number;
  readonly attachments: number;
  readonly comments: number;
}

interface LandingTaskColumn {
  readonly key: LandingTaskColumnKey;
  readonly title: string;
  readonly accent: LandingTaskColumnKey;
  readonly tasks: LandingTaskCard[];
}

interface LandingAnalyticsKpi {
  readonly key: string;
  readonly title: string;
  readonly value: string;
  readonly delta: string;
}

interface LandingAnalyticsCategory {
  readonly title: string;
  readonly subtitle: string;
  readonly value: number;
  readonly trendBars: readonly number[];
}

type LandingDirectoryCatalogKey = 'services' | 'clients' | 'staff';

interface LandingDirectoryRecord {
  readonly id: string;
  readonly title: string;
  readonly value: string;
  readonly meta: string;
}

interface LandingDirectoryCatalog {
  readonly key: LandingDirectoryCatalogKey;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: string;
  readonly kindLabel: string;
  readonly records: readonly LandingDirectoryRecord[];
}
