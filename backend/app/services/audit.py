from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent
from app.models.user_notification import UserNotification
from app.models.user import User


async def log_audit_event(
    db: AsyncSession,
    *,
    actor_user: User | None,
    owner_id: int | None,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    status: str = "success",
    metadata: dict | None = None,
) -> AuditEvent:
    event = AuditEvent(
        actor_user_id=actor_user.id if actor_user else None,
        actor_role=actor_user.role if actor_user else None,
        owner_id=owner_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        status=status,
        metadata_json=metadata,
    )
    db.add(event)
    await db.flush()
    return event


def notification_title_for_action(action: str) -> str:
    mapping = {
        "table.invite.created": "Создано приглашение",
        "table.invite.accepted": "Присоединение к столу",
        "table.invite.failed": "Ошибка присоединения",
        "table.created": "Стол создан",
        "table.deleted": "Стол удален",
        "table.detach.requested": "Запрос на открепление",
    }
    return mapping.get(action, "Системное событие")


async def create_user_notification(
    db: AsyncSession,
    *,
    user_id: int,
    kind: str,
    title: str,
    message: str,
    priority: str = "normal",
    payload: dict | None = None,
) -> UserNotification:
    row = UserNotification(
        user_id=user_id,
        kind=kind,
        title=title,
        message=message,
        priority=priority,
        is_read=False,
        payload=payload,
    )
    db.add(row)
    await db.flush()
    return row


async def mark_notifications_read_now(db: AsyncSession, notifications: list[UserNotification]) -> None:
    now = datetime.now(UTC)
    for item in notifications:
        item.is_read = True
        item.read_at = now
        db.add(item)
