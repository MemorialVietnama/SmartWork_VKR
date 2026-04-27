from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.models.user_notification import UserNotification
from app.routers.auth import get_current_user
from app.schemas.notifications import NotificationDto, NotificationReadRequest, NotificationsListResponse

router = APIRouter()


@router.get("/my", response_model=NotificationsListResponse)
async def my_notifications(
    limit: int = Query(30, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationsListResponse:
    rows_res = await db.execute(
        select(UserNotification)
        .where(UserNotification.user_id == current_user.id)
        .order_by(desc(UserNotification.created_at))
        .limit(limit)
        .offset(offset),
    )
    rows = rows_res.scalars().all()
    unread_res = await db.execute(
        select(func.count(UserNotification.id)).where(
            UserNotification.user_id == current_user.id,
            UserNotification.is_read.is_(False),
        ),
    )
    unread_count = int(unread_res.scalar_one() or 0)
    return NotificationsListResponse(
        items=[
            NotificationDto(
                id=item.id,
                kind=item.kind,
                title=item.title,
                message=item.message,
                priority=item.priority,
                is_read=item.is_read,
                payload=item.payload,
                created_at=item.created_at,
                read_at=item.read_at,
            )
            for item in rows
        ],
        unread_count=unread_count,
    )


@router.post("/mark-read")
async def mark_notifications_read(
    req: NotificationReadRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if req.ids:
        rows_res = await db.execute(
            select(UserNotification).where(
                UserNotification.user_id == current_user.id,
                UserNotification.id.in_(req.ids),
            ),
        )
        rows = rows_res.scalars().all()
    else:
        rows_res = await db.execute(
            select(UserNotification).where(
                UserNotification.user_id == current_user.id,
                UserNotification.is_read.is_(False),
            ),
        )
        rows = rows_res.scalars().all()
    now = datetime.now(UTC)
    for row in rows:
        row.is_read = True
        row.read_at = now
        db.add(row)
    await db.commit()
    return {"detail": "ok", "updated": len(rows)}
