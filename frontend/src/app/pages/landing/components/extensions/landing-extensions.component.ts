import { ChangeDetectionStrategy, Component } from '@angular/core';

type ExtensionState = 'available' | 'unavailable' | 'limited';

interface ExtensionRow {
  readonly label: string;
  readonly value: string;
  readonly baseState: ExtensionState;
  readonly expandedState: ExtensionState;
}

interface ExtensionGroup {
  readonly id: string;
  readonly title: string;
  readonly rows: readonly ExtensionRow[];
}

@Component({
  selector: 'app-landing-extensions',
  imports: [],
  templateUrl: './landing-extensions.component.html',
  styleUrls: ['../../landing-shared.scss', './landing-extensions.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingExtensionsComponent {
  protected readonly extensionGroups: readonly ExtensionGroup[] = [
    {
      id: 'core',
      title: 'Основные функции',
      rows: [
        {
          label: 'Календарь',
          value: 'Быстрая запись клиентов и контроль расписания',
          baseState: 'available',
          expandedState: 'available',
        },
        {
          label: 'Заказы',
          value: 'Единый поток заказов и статусов в одном окне',
          baseState: 'available',
          expandedState: 'available',
        },
      ],
    },
    {
      id: 'management',
      title: 'Управление',
      rows: [
        {
          label: 'Kanban задачи',
          value: 'Управление процессами в команде и контроль дедлайнов',
          baseState: 'unavailable',
          expandedState: 'available',
        },
        {
          label: 'Сотрудники',
          value: 'Персональные доступы и роли под структуру команды',
          baseState: 'limited',
          expandedState: 'available',
        },
      ],
    },
    {
      id: 'analytics',
      title: 'Аналитика',
      rows: [
        {
          label: 'Продвинутая аналитика',
          value: 'KPI, тренды и метрики для управленческих решений',
          baseState: 'unavailable',
          expandedState: 'available',
        },
        {
          label: 'История и аудит',
          value: 'Полная история действий и изменений за период',
          baseState: 'unavailable',
          expandedState: 'available',
        },
      ],
    },
    {
      id: 'scale',
      title: 'Масштабирование',
      rows: [
        {
          label: 'Места сотрудников',
          value: 'Рост команды без миграции на другой стол',
          baseState: 'limited',
          expandedState: 'available',
        },
        {
          label: 'Справочники',
          value: 'Дополнительные каталоги под ваш формат работы',
          baseState: 'limited',
          expandedState: 'available',
        },
      ],
    },
  ];

  protected stateIcon(state: ExtensionState): string {
    if (state === 'available') {
      return '✔';
    }
    if (state === 'limited') {
      return '⚠';
    }
    return '✖';
  }

  protected stateLabel(state: ExtensionState): string {
    if (state === 'available') {
      return 'Доступно';
    }
    if (state === 'limited') {
      return 'Ограничено';
    }
    return 'Недоступно';
  }
}
