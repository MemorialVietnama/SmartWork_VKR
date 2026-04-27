from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.audit_event import AuditEvent
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.audit import AuditEventDto

router = APIRouter()


@router.get("/events", response_model=list[AuditEventDto])
async def list_audit_events(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AuditEventDto]:
    if current_user.role not in {"owner", "staff"}:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    if current_user.role == "owner":
        scope_owner_id = current_user.id
        stmt = (
            select(AuditEvent)
            .where(AuditEvent.owner_id == scope_owner_id)
            .order_by(desc(AuditEvent.created_at))
            .limit(limit)
            .offset(offset)
        )
    else:
        stmt = (
            select(AuditEvent)
            .where(
                (AuditEvent.actor_user_id == current_user.id) | (AuditEvent.owner_id == current_user.owner_id),
            )
            .order_by(desc(AuditEvent.created_at))
            .limit(limit)
            .offset(offset)
        )
    rows_res = await db.execute(stmt)
    rows = rows_res.scalars().all()
    return [
        AuditEventDto(
            id=item.id,
            actor_user_id=item.actor_user_id,
            actor_role=item.actor_role,
            owner_id=item.owner_id,
            action=item.action,
            entity_type=item.entity_type,
            entity_id=item.entity_id,
            status=item.status,
            metadata=item.metadata_json,
            created_at=item.created_at,
        )
        for item in rows
    ]
