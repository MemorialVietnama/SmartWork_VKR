import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import type { LandingApiId, LandingSelectOption } from '../../landing.models';

type ResponseStatus = 200 | 201 | 401 | 422 | 500;

@Component({
  selector: 'app-landing-api',
  imports: [FormsModule, CardModule, SelectButtonModule, SelectModule, ButtonModule],
  templateUrl: './landing-api.component.html',
  styleUrls: ['../../landing-shared.scss', './landing-api.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingApiComponent {
  readonly apiId = input.required<LandingApiId>();
  readonly apiOptions = input.required<LandingSelectOption<LandingApiId>[]>();

  readonly apiChange = output<LandingApiId>();

  protected readonly statusOptions: ResponseStatus[] = [200, 201, 401, 422, 500];
  protected readonly selectedStatus = signal<ResponseStatus>(200);
  protected readonly loading = signal(false);
  protected readonly responseCode = signal<ResponseStatus | null>(null);
  protected readonly responseBody = signal('');
  protected readonly requestHeaders = computed(() => {
    return '{\n  "Authorization": "Bearer <access_token>",\n  "Content-Type": "application/json",\n  "X-Workspace-Id": "table_42"\n}';
  });

  protected readonly method = computed(() => {
    const id = this.apiId();
    if (id === 'analytics') {
      return 'GET';
    }
    if (id === 'webhook') {
      return 'PUT';
    }
    return 'POST';
  });

  protected readonly endpoint = computed(() => {
    const id = this.apiId();
    if (id === 'booking') {
      return '/api/v1/tables/42/workspace/calendar/slots';
    }
    if (id === 'tasks') {
      return '/api/v1/tables/42/workspace/tasks';
    }
    if (id === 'analytics') {
      return '/api/v1/tables/42/workspace/analytics?period=30d';
    }
    return '/api/v1/hooks/table-events';
  });

  protected readonly payload = computed(() => {
    const id = this.apiId();
    if (id === 'booking') {
      return '{\n  "title": "Запись #901",\n  "client_name": "Петров Игорь",\n  "starts_at": "2026-04-22T10:00:00Z",\n  "ends_at": "2026-04-22T10:45:00Z",\n  "service": "Комплекс стрижка + борода"\n}';
    }
    if (id === 'tasks') {
      return '{\n  "title": "Подтвердить поставку расходников",\n  "priority": "high",\n  "status": "new",\n  "assignee_user_id": 12,\n  "deadline": "2026-04-22T18:00:00Z"\n}';
    }
    if (id === 'analytics') {
      return '{\n  "period": "30d",\n  "group_by": "service",\n  "include_forecast": true\n}';
    }
    return '{\n  "event": "table.task.updated",\n  "target_url": "https://crm.example.com/webhooks/smartwork",\n  "secret": "sw_live_x8Hf..."\n}';
  });

  protected readonly apiHighlights = computed(() => {
    switch (this.apiId()) {
      case 'booking':
        return [
          'Для мессенджеров: прямое управление записью из чат-бота',
          'Синхронизация расписания в реальном времени',
          'Автоматическое создание карточек клиента',
          'Сценарии подтверждения и напоминаний',
          'Быстрый запуск интеграции без ручного ввода',
        ];
      case 'tasks':
        return [
          'Адаптация под CRM: обмен задачами и статусами',
          'Назначение ответственных из внешней системы',
          'Триггеры на смену этапов и дедлайнов',
          'Контроль командной нагрузки',
          'Автоматизация повторяющихся процессов',
        ];
      case 'analytics':
        return [
          'Сквозная аналитика по услугам и выручке',
          'Выгрузка метрик в BI-инструменты',
          'Отчеты в едином формате для руководителя',
          'Сравнение периодов без ручной обработки',
          'База для прогнозирования загрузки',
        ];
      default:
        return [
          'События в реальном времени через webhook',
          'Интеграция с внешними сервисами и bot-платформами',
          'Автоматический запуск бизнес-сценариев',
          'Снижение ручных операций в команде',
          'Масштабирование процессов без изменения UI',
        ];
    }
  });

  protected readonly isSuccess = computed(() => {
    const code = this.responseCode();
    return code === 200 || code === 201;
  });

  protected runRequestDemo(): void {
    this.loading.set(true);
    this.responseCode.set(null);
    window.setTimeout(() => {
      const status = this.selectedStatus();
      this.responseCode.set(status);
      this.responseBody.set(this.responsePreview(status));
      this.loading.set(false);
    }, 700);
  }

  private responsePreview(status: ResponseStatus): string {
    if (status === 200) {
      return '{\n  "ok": true,\n  "request_id": "req_8f2k31",\n  "latency_ms": 128,\n  "data": {\n    "result": "Запрос выполнен",\n    "sync_state": "up_to_date"\n  }\n}';
    }
    if (status === 201) {
      return '{\n  "ok": true,\n  "request_id": "req_0ca118",\n  "created": true,\n  "entity_id": "task_9871"\n}';
    }
    if (status === 401) {
      return '{\n  "detail": "Unauthorized",\n  "message": "Token missing or expired",\n  "request_id": "req_auth_31"\n}';
    }
    if (status === 422) {
      return '{\n  "detail": [\n    {\n      "loc": ["body", "title"],\n      "msg": "Field required"\n    },\n    {\n      "loc": ["body", "starts_at"],\n      "msg": "Invalid datetime format"\n    }\n  ]\n}';
    }
    return '{\n  "detail": "Internal Server Error",\n  "request_id": "req_fail_114",\n  "retry_after_sec": 20\n}';
  }
}