from __future__ import annotations

from pathlib import Path

from odf.opendocument import OpenDocumentText
from odf.text import P


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out = root / "docs" / "SmartWork-database-design-chapter.odt"
    doc = OpenDocumentText()
    paragraphs = [
        (
            "База данных на PostgreSQL в системе SmartWork предназначена для хранения учётных записей и "
            "профилей пользователей, персональных настроек интерфейса и каналов уведомлений, персональных "
            "уведомлений, журнала аудита действий, а также данных рабочих пространств «стол» (таблица tables), "
            "вокруг которых сгруппированы участники, задачи, заказы с привязкой к справочникам, календарные слоты, "
            "динамические справочники с элементами, бонусные показатели и заявки на отключение стола. СУБД "
            "обеспечивает ссылочную целостность внешними ключами, хранение времени с учётом часового пояса "
            "(timestamptz), дат без времени (date), поля JSON и JSONB для полуструктурированных данных, "
            "а таблица alembic_version фиксирует номер применённой миграции схемы Alembic."
        ),
        (
            "При создании структуры целесообразно разделять контуры ответственности: идентичность и права "
            "(users, user_settings, user_notifications, audit_events), конфигурация и членство в столах "
            "(tables, table_members, table_detach_requests), предметные данные стола (tasks, orders, calendar, "
            "directories, bonuses). Доступ пользователей к столам задаётся связующей таблицей многие-ко-многим "
            "table_members с уникальной парой table_id и user_id на уровне приложения и базы. Следует "
            "предусмотреть суррогатные первичные ключи serial, индексы по полям фильтрации и отчётов: время "
            "создания и признак прочтения уведомлений, тип и время у аудита, статусы заявок на отключение, "
            "идентификаторы и интервалы заказов. Для заказов важны стабильные order_uuid и order_number с "
            "уникальностью в миграциях и индексами, проверка смысловых ограничений интервалов starts_at и ends_at "
            "и цен на уровне приложения или CHECK. При удалении элементов справочника, на которые ссылается "
            "client_directory_item_id заказа, нужна политика RESTRICT или мягкое архивирование, чтобы не "
            "нарушать историю. Пароли хранятся только в виде password_hash. Для полей, где важны операторы "
            "контейнера и индексация по ключам внутри документа, в актуальной схеме применён тип JSONB "
            "(payload в user_notifications, metadata_json в audit_events, schema_fields в table_directories, "
            "payload в table_directory_items); тип JSON без суффикса B используется для order_enabled_directory_ids "
            "в tables, service_item_ids, custom_directory_links и metadata_json в table_orders согласно "
            "миграциям Alembic в репозитории проекта."
        ),
        (
            "Спроектированная база представлена ER-диаграммой актуальной схемы public в файле "
            "docs/ER-smartwork-public.png (копия исходного экспорта smartwork 2 - smartwork - public.png); "
            "ранее использовавшийся упрощённый вариант остаётся в docs/ER.pdf для сопоставления эволюции. "
            "На диаграмме отражены сущности users, user_settings, user_notifications, audit_events, tables "
            "с полем order_enabled_directory_ids, table_members, table_detach_requests, table_tasks, "
            "table_orders, table_calendar_slots, table_directories, table_directory_items, table_bonuses и "
            "alembic_version, а также связи один-ко-многим от tables и users к зависимым таблицам и связь "
            "многие-ко-многим пользователей со столами через table_members."
        ),
        (
            "Таблица users с первичным ключом id хранит ФИО, уникальный login, password_hash, роль, is_active, "
            "контакты, профиль, самоссылку owner_id на другого пользователя, поля внешней аутентификации provider "
            "и provider_user_id, created_at. user_settings по user_id ссылается на users и хранит параметры "
            "оформления и булевы флаги источников и каналов уведомлений. user_notifications по user_id ссылается "
            "на users и содержит kind, title, message, priority, is_read, payload в JSONB, created_at и read_at. "
            "audit_events хранит actor_user_id и owner_id с опциональной ссылкой на users, actor_role, action, "
            "entity_type, entity_id, status, metadata_json в JSONB и created_at для расследования инцидентов."
        ),
        (
            "Таблица tables с ключом id описывает стол: заголовок, описание, визуальные и календарные настройки, "
            "owner_id на users, created_at и order_enabled_directory_ids в JSON для выбора справочников, "
            "участвующих в оформлении заказов. table_members связывает table_id с tables и user_id с users. "
            "table_detach_requests связывает table_id с tables, owner_user_id и staff_user_id с users, "
            "reason, status, created_at и resolved_at. table_tasks привязывает задачи к table_id, опционально "
            "assignee_user_id к users, хранит title, status, created_at."
        ),
        (
            "table_directories по table_id ссылается на tables, задаёт name, description, schema_fields в JSONB, "
            "kind и created_at. table_directory_items по directory_id ссылается на table_directories с каскадным "
            "удалением в ORM, хранит label, value и payload в JSONB. table_orders по table_id ссылается на tables, "
            "содержит order_uuid, order_number, title, starts_at, ends_at, client_directory_item_id на "
            "table_directory_items, assignee_user_id на users, service_item_ids и custom_directory_links в JSON, "
            "status, price_base, price_adjustment, price_total, parent_order_id на саму table_orders для "
            "иерархии, child_type, metadata_json в JSON, created_at, updated_at и completed_at. "
            "table_calendar_slots привязаны к tables по table_id и хранят интервал и заголовок. table_bonuses "
            "агрегируют key и qty по table_id. Таблица alembic_version с полем version_num фиксирует версию "
            "миграций. В сумме users и tables выступают двумя опорными узлами: первая группа таблиц поддерживает "
            "учёт и наблюдаемость, вторая — операционные данные рабочего места и связь заказов со справочниками."
        ),
    ]
    for text in paragraphs:
        doc.text.addElement(P(text=text))
    doc.save(str(out))


if __name__ == "__main__":
    main()
