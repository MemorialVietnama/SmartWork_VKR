import secrets
from datetime import datetime

import redis.asyncio as redis
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.table import Table
from app.models.table_bonus import TableBonus
from app.models.table_member import TableMember
from app.models.table_directory import TableDirectory
from app.models.table_order import TableOrder
from app.models.table_task import TableTask
from app.models.table_calendar_slot import TableCalendarSlot
from app.models.user import User
from app.routers.auth import get_current_user
from app.config.directory_presets import ANIMAL_TYPES, normalize_table_preset
from app.schemas.table import (
    TableBonusDto,
    TableAnalyticsDto,
    TableCreateConfirmRequest,
    TableCreateRequest,
    TableDeleteConfirmRequest,
    TableDto,
    TableStatDto,
    TableMemberAddRequest,
    TableSubscriptionDto,
    TableSubscriptionUpdateRequest,
)
from app.services.directory_bootstrap import bootstrap_preset_directories
from app.services.email_sender import send_email
from app.services.analytics import build_analytics_range, build_table_analytics, table_members_count

router = APIRouter()


def _owner_short_name(user: User) -> str:
    last_name = (user.last_name or "").strip()
    first_name = (user.first_name or "").strip()
    if not last_name and not first_name:
        return user.login
    first_initial = f"{first_name[0]}." if first_name else ""
    return f"{last_name} {first_initial}".strip()


TABLE_CREATE_CODE_TTL_SECONDS = 10 * 60
TABLE_DELETE_CODE_TTL_SECONDS = 10 * 60


async def _create_table_from_payload(db: AsyncSession, current_user: User, req: TableCreateRequest) -> TableDto:
    participants_count = 1
    table = Table(
        title=req.title.strip(),
        description=req.description.strip() if req.description else None,
        color=None,
        preset=normalize_table_preset(req.preset.strip()),
        custom_preset_name=req.custom_preset_name.strip() if req.custom_preset_name else None,
        time_format=req.time_format.strip(),
        week_start_day=req.week_start_day.strip(),
        work_hours=req.work_hours.strip(),
        owner_id=current_user.id,
    )
    db.add(table)
    await db.commit()
    await db.refresh(table)

    for bonus_key in req.bonus_keys:
        db.add(TableBonus(table_id=table.id, key=bonus_key, qty=1))

    if req.selected_employee_ids:
        res = await db.execute(
            select(User.id).where(User.id.in_(req.selected_employee_ids), User.owner_id == current_user.id),
        )
        allowed_ids = [item[0] for item in res.all()]
        participants_count += len(allowed_ids)
        for employee_id in allowed_ids:
            db.add(TableMember(table_id=table.id, user_id=employee_id))
    await db.commit()
    await bootstrap_preset_directories(db, table.id, req.preset)
    return TableDto(
        id=table.id,
        title=table.title,
        description=table.description,
        color=table.color,
        total_participants=participants_count,
        owner_short_name=_owner_short_name(current_user),
        stats=TableStatDto(),
    )


@router.post("/create/request-code")
async def request_create_table_code(
    req: TableCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can create table")

    code = f"{secrets.randbelow(1000000):06d}"
    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        await r.setex(f"table_create_code:{current_user.id}", TABLE_CREATE_CODE_TTL_SECONDS, code)
        await r.setex(
            f"table_create_payload:{current_user.id}",
            TABLE_CREATE_CODE_TTL_SECONDS,
            req.model_dump_json(),
        )
    finally:
        await r.aclose()

    try:
        await send_email(
            to_email=current_user.login,
            subject="SmartWork: подтверждение создания стола",
            body_text=(
                "Код подтверждения создания стола:\n"
                f"{code}\n\n"
                "Код действует 10 минут."
            ),
        )
    except Exception:
        pass

    return {"detail": "Код подтверждения отправлен на email."}


@router.post("/create/confirm", response_model=TableDto)
async def confirm_create_table(
    req: TableCreateConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TableDto:
    if current_user.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can create table")

    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        saved_code = await r.get(f"table_create_code:{current_user.id}")
        payload_raw = await r.get(f"table_create_payload:{current_user.id}")
        if not saved_code or not payload_raw:
            raise HTTPException(status_code=400, detail="Код истек. Запросите новый.")
        if saved_code != req.code.strip():
            raise HTTPException(status_code=400, detail="Неверный код подтверждения.")

        await r.delete(f"table_create_code:{current_user.id}")
        await r.delete(f"table_create_payload:{current_user.id}")
    finally:
        await r.aclose()

    payload = TableCreateRequest.model_validate_json(payload_raw)
    return await _create_table_from_payload(db=db, current_user=current_user, req=payload)


@router.post("/{table_id}/delete/request-code")
async def request_delete_table_code(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can delete table")
    table_res = await db.execute(select(Table).where(Table.id == table_id, Table.owner_id == current_user.id))
    table = table_res.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")

    code = f"{secrets.randbelow(1000000):06d}"
    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        await r.setex(f"table_delete_code:{current_user.id}:{table_id}", TABLE_DELETE_CODE_TTL_SECONDS, code)
    finally:
        await r.aclose()

    try:
        await send_email(
            to_email=current_user.login,
            subject="SmartWork: подтверждение удаления стола",
            body_text=(
                f"Код подтверждения удаления стола «{table.title}»:\n"
                f"{code}\n\n"
                "Код действует 10 минут."
            ),
        )
    except Exception:
        pass

    return {"detail": "Код подтверждения отправлен на email."}


@router.post("/{table_id}/delete/confirm")
async def confirm_delete_table(
    table_id: int,
    req: TableDeleteConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can delete table")
    table_res = await db.execute(select(Table).where(Table.id == table_id, Table.owner_id == current_user.id))
    table = table_res.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")

    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        saved_code = await r.get(f"table_delete_code:{current_user.id}:{table_id}")
        if not saved_code:
            raise HTTPException(status_code=400, detail="Код истек. Запросите новый.")
        if saved_code != req.code.strip():
            raise HTTPException(status_code=400, detail="Неверный код подтверждения.")
        await r.delete(f"table_delete_code:{current_user.id}:{table_id}")
    finally:
        await r.aclose()

    await db.execute(delete(TableMember).where(TableMember.table_id == table_id))
    await db.execute(delete(TableBonus).where(TableBonus.table_id == table_id))
    await db.execute(delete(TableCalendarSlot).where(TableCalendarSlot.table_id == table_id))
    await db.execute(delete(TableTask).where(TableTask.table_id == table_id))
    await db.execute(delete(TableOrder).where(TableOrder.table_id == table_id))
    await db.execute(delete(TableDirectory).where(TableDirectory.table_id == table_id))
    await db.delete(table)
    await db.commit()
    return {"detail": "Стол удален"}


@router.get("/directory-presets/animal-types", response_model=list[str])
async def directory_preset_animal_types() -> list[str]:
    """Типы животных для справочника «Питомцы» (груминг)."""
    return list(ANIMAL_TYPES)


@router.get("/subscriptions/my", response_model=list[TableSubscriptionDto])
async def my_table_subscriptions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TableSubscriptionDto]:
    tables_res = await db.execute(select(Table.id).where(Table.owner_id == current_user.id))
    table_ids = [item[0] for item in tables_res.all()]
    if not table_ids:
        return []

    bonuses_res = await db.execute(select(TableBonus).where(TableBonus.table_id.in_(table_ids)))
    bonuses = bonuses_res.scalars().all()
    by_table: dict[int, list[TableBonusDto]] = {table_id: [] for table_id in table_ids}
    for bonus in bonuses:
        by_table.setdefault(bonus.table_id, []).append(TableBonusDto(key=bonus.key, qty=bonus.qty))

    return [TableSubscriptionDto(table_id=table_id, bonuses=by_table.get(table_id, [])) for table_id in table_ids]


@router.put("/{table_id}/subscriptions", response_model=TableSubscriptionDto)
async def update_table_subscription(
    table_id: int,
    req: TableSubscriptionUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TableSubscriptionDto:
    table_res = await db.execute(select(Table).where(Table.id == table_id, Table.owner_id == current_user.id))
    table = table_res.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")

    existing_res = await db.execute(select(TableBonus).where(TableBonus.table_id == table_id))
    existing = existing_res.scalars().all()
    for item in existing:
        await db.delete(item)

    for bonus in req.bonuses:
        if bonus.qty > 0:
            db.add(TableBonus(table_id=table_id, key=bonus.key, qty=bonus.qty))

    await db.commit()

    fresh_res = await db.execute(select(TableBonus).where(TableBonus.table_id == table_id))
    fresh = fresh_res.scalars().all()
    return TableSubscriptionDto(
        table_id=table_id,
        bonuses=[TableBonusDto(key=item.key, qty=item.qty) for item in fresh],
    )


@router.post("/{table_id}/members")
async def add_table_member(
    table_id: int,
    req: TableMemberAddRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Только владелец может добавлять сотрудников в стол")
    table_res = await db.execute(select(Table).where(Table.id == table_id, Table.owner_id == current_user.id))
    table = table_res.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")

    employee_res = await db.execute(select(User).where(User.id == req.employee_id, User.owner_id == current_user.id))
    employee = employee_res.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    exists_res = await db.execute(
        select(TableMember).where(TableMember.table_id == table_id, TableMember.user_id == req.employee_id),
    )
    if exists_res.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Сотрудник уже в столе")

    db.add(TableMember(table_id=table_id, user_id=req.employee_id))
    await db.commit()
    return {"detail": "Сотрудник добавлен в стол"}


@router.get("/my", response_model=list[TableDto])
async def my_tables(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TableDto]:
    if current_user.role == "owner":
        res = await db.execute(select(Table).where(Table.owner_id == current_user.id).order_by(Table.created_at.desc()))
        tables = res.scalars().all()
    else:
        member_res = await db.execute(select(TableMember.table_id).where(TableMember.user_id == current_user.id))
        member_table_ids = [item[0] for item in member_res.all()]
        if not member_table_ids:
            return []
        res = await db.execute(select(Table).where(Table.id.in_(member_table_ids)).order_by(Table.created_at.desc()))
        tables = res.scalars().all()

    table_ids = [table.id for table in tables]
    members_count: dict[int, int] = {}
    if table_ids:
        members_res = await db.execute(select(TableMember).where(TableMember.table_id.in_(table_ids)))
        for member in members_res.scalars().all():
            members_count[member.table_id] = members_count.get(member.table_id, 0) + 1

    owner_ids = {table.owner_id for table in tables}
    owners_map: dict[int, User] = {}
    if owner_ids:
        owners_res = await db.execute(select(User).where(User.id.in_(owner_ids)))
        owners = owners_res.scalars().all()
        owners_map = {owner.id: owner for owner in owners}

    return [
        TableDto(
            id=table.id,
            title=table.title,
            description=table.description,
            color=table.color,
            total_participants=1 + members_count.get(table.id, 0),
            owner_short_name=_owner_short_name(owners_map.get(table.owner_id, current_user)),
            stats=TableStatDto(),
        )
        for table in tables
    ]


@router.get("/analytics/my", response_model=list[TableAnalyticsDto])
async def my_tables_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    from_ts: datetime | None = Query(None, alias="from"),
    to_ts: datetime | None = Query(None, alias="to"),
    bucket: str = Query("day"),
) -> list[TableAnalyticsDto]:
    if current_user.role == "owner":
        tables_res = await db.execute(select(Table).where(Table.owner_id == current_user.id).order_by(Table.created_at.desc()))
        tables = tables_res.scalars().all()
    else:
        member_res = await db.execute(select(TableMember.table_id).where(TableMember.user_id == current_user.id))
        member_table_ids = [item[0] for item in member_res.all()]
        if not member_table_ids:
            return []
        tables_res = await db.execute(select(Table).where(Table.id.in_(member_table_ids)).order_by(Table.created_at.desc()))
        tables = tables_res.scalars().all()

    rng = build_analytics_range(from_ts=from_ts, to_ts=to_ts, bucket=bucket)
    out: list[TableAnalyticsDto] = []
    for table in tables:
        members_count = await table_members_count(db, table.id)
        out.append(
            await build_table_analytics(
                db=db,
                table_id=table.id,
                table_name=table.title,
                participants=1 + members_count,
                active_employees=members_count,
                rng=rng,
            ),
        )
    return out
