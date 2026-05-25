from __future__ import annotations

from datetime import UTC, datetime, timedelta
from datetime import time as dtime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.table import Table
from app.models.table_bonus import TableBonus
from app.models.table_calendar_slot import TableCalendarSlot
from app.models.table_directory import TableDirectory, TableDirectoryItem
from app.models.table_member import TableMember
from app.models.table_order import TableOrder
from app.models.table_task import TableTask
from app.models.user import User
from app.routers.auth import get_current_user
from app.routers.tables import _owner_short_name
from app.schemas.table import TableAnalyticsDto, TableBonusDto, TableStatDto
from app.config.directory_presets import PRESET_DIRECTORY_SEED, directories_for_preset, empty_payload_for_kind, preset_has_directory_template
from app.services.directory_bootstrap import (
    ensure_template_directory_enabled,
    repair_preset_directories as run_preset_directories_repair,
)
from app.services.analytics import build_analytics_range, build_table_analytics, table_members_count
from app.services.audit import create_user_notification
from app.schemas.table_workspace import (
    CalendarSlotCreateRequest,
    CalendarSlotPatchRequest,
    CalendarSlotDto,
    DirectoryItemCreateRequest,
    DirectoryItemDto,
    DirectoryItemPatchRequest,
    PresetDirectoriesRepairResultDto,
    TemplateDirectoryStateDto,
    TemplateDirectoryToggleRequest,
    LegacyCustomDirectoriesCleanupDto,
    TableDetailDto,
    TablePatchRequest,
    TableDirectoryCreateRequest,
    TableDirectoryDto,
    TableMemberBriefDto,
    TableOrderCreateRequest,
    TableOrderCreateChildRequest,
    TableOrderDto,
    TableOrderRescheduleRequest,
    OrderAvailabilityCheckResponse,
    OrderAvailabilityWarningDto,
    TableOrderUpdateRequest,
    TableTaskCreateRequest,
    TableTaskDto,
    TableTaskUpdateRequest,
    ShiftScheduleApplyRequest,
    ShiftScheduleApplyResponse,
)

router = APIRouter()


async def _bonus_qty(db: AsyncSession, table_id: int, key: str) -> int:
    res = await db.execute(select(TableBonus).where(TableBonus.table_id == table_id, TableBonus.key == key))
    row = res.scalar_one_or_none()
    return row.qty if row else 0


# Минимум слотов справочников без покупки бонуса (вкладка доступна по умолчанию).
DEFAULT_DIRECTORY_SLOTS = 1


async def _directory_slot_limit(db: AsyncSession, table_id: int) -> int:
    return max(await _bonus_qty(db, table_id, "extra_directories"), DEFAULT_DIRECTORY_SLOTS)


def _directory_item_dto(item: TableDirectoryItem) -> DirectoryItemDto:
    return DirectoryItemDto(id=item.id, label=item.label, value=item.value, payload=item.payload)


def _order_dto(order: TableOrder) -> TableOrderDto:
    return TableOrderDto(
        id=order.id,
        order_uuid=order.order_uuid,
        order_number=order.order_number,
        title=order.title,
        starts_at=order.starts_at,
        ends_at=order.ends_at,
        client_directory_item_id=order.client_directory_item_id,
        assignee_user_id=order.assignee_user_id,
        service_item_ids=list(order.service_item_ids or []),
        custom_directory_links=list(order.custom_directory_links or []),
        status=order.status,
        price_base=float(order.price_base or 0.0),
        price_adjustment=float(order.price_adjustment or 0.0),
        price_total=float(order.price_total or 0.0),
        parent_order_id=order.parent_order_id,
        child_type=order.child_type,
        metadata=order.metadata_json,
        created_at=order.created_at,
        completed_at=order.completed_at,
    )


async def _require_table_access(
    db: AsyncSession,
    current_user: User,
    table_id: int,
) -> tuple[Table, bool]:
    res = await db.execute(select(Table).where(Table.id == table_id))
    table = res.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")
    if table.owner_id == current_user.id:
        return table, True
    mem = await db.execute(
        select(TableMember).where(TableMember.table_id == table_id, TableMember.user_id == current_user.id),
    )
    if mem.scalar_one_or_none():
        return table, False
    raise HTTPException(status_code=403, detail="Нет доступа к столу")


async def _compute_stats(db: AsyncSession, table_id: int, _member_count: int) -> TableStatDto:
    now = datetime.now(UTC)
    q_queued = await db.execute(
        select(func.count()).select_from(TableOrder).where(TableOrder.table_id == table_id, TableOrder.status == "queued"),
    )
    queued = int(q_queued.scalar() or 0)
    q_new_orders_24h = await db.execute(
        select(func.count())
        .select_from(TableOrder)
        .where(
            TableOrder.table_id == table_id,
            TableOrder.created_at >= now.replace(microsecond=0) - timedelta(hours=24),
            TableOrder.created_at <= now,
        ),
    )
    new_orders_24h = int(q_new_orders_24h.scalar() or 0)

    active_employees_res = await db.execute(
        select(func.count(func.distinct(TableCalendarSlot.title))).where(
            TableCalendarSlot.table_id == table_id,
            TableCalendarSlot.title.is_not(None),
            TableCalendarSlot.title != "",
        ),
    )
    active_employees = int(active_employees_res.scalar() or 0)

    td = await db.execute(select(func.count()).select_from(TableTask).where(TableTask.table_id == table_id, TableTask.status == "done"))
    tw = await db.execute(select(func.count()).select_from(TableTask).where(TableTask.table_id == table_id, TableTask.status == "waiting"))
    tn = await db.execute(select(func.count()).select_from(TableTask).where(TableTask.table_id == table_id, TableTask.status == "new"))

    return TableStatDto(
        active_employees=max(0, active_employees),
        queued_orders=queued,
        tasks_done=int(td.scalar() or 0),
        tasks_waiting=int((tw.scalar() or 0) + (tn.scalar() or 0)),
        tasks_new=0,
        new_orders_24h=new_orders_24h,
    )


def _member_name(u: User) -> str:
    return _owner_short_name(u)


@router.get("/{table_id}", response_model=TableDetailDto)
async def get_table_detail(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TableDetailDto:
    table, is_owner = await _require_table_access(db, current_user, table_id)

    members_res = await db.execute(select(TableMember).where(TableMember.table_id == table_id))
    members = members_res.scalars().all()
    total_participants = 1 + len(members)

    owner_res = await db.execute(select(User).where(User.id == table.owner_id))
    owner = owner_res.scalar_one_or_none()
    owner_name = _owner_short_name(owner) if owner else ""

    stats = await _compute_stats(db, table_id, len(members))

    b_res = await db.execute(select(TableBonus).where(TableBonus.table_id == table_id))
    bonus_rows = b_res.scalars().all()
    bonuses = [TableBonusDto(key=b.key, qty=b.qty) for b in bonus_rows]

    return TableDetailDto(
        id=table.id,
        title=table.title,
        description=table.description,
        preset=table.preset,
        custom_preset_name=table.custom_preset_name,
        time_format=table.time_format,
        week_start_day=table.week_start_day,
        work_hours=table.work_hours,
        total_participants=total_participants,
        owner_short_name=owner_name,
        stats=stats,
        can_edit_settings=is_owner,
        bonuses=bonuses,
        order_enabled_directory_ids=list(table.order_enabled_directory_ids or []),
    )


@router.patch("/{table_id}", response_model=TableDetailDto)
async def patch_table_detail(
    table_id: int,
    req: TablePatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TableDetailDto:
    table, is_owner = await _require_table_access(db, current_user, table_id)
    if not is_owner:
        raise HTTPException(status_code=403, detail="Только владелец может менять настройки стола")

    if req.title is not None:
        table.title = req.title.strip()
    if req.description is not None:
        desc = req.description.strip()
        table.description = desc if desc else None
    if req.color is not None:
        c = req.color.strip()
        table.color = c if c else None
    if req.time_format is not None:
        table.time_format = req.time_format.strip()
    if req.week_start_day is not None:
        table.week_start_day = req.week_start_day.strip()
    if req.work_hours is not None:
        table.work_hours = req.work_hours.strip()
    if req.order_enabled_directory_ids is not None:
        table.order_enabled_directory_ids = [int(x) for x in req.order_enabled_directory_ids]

    await db.commit()
    return await get_table_detail(table_id, db, current_user)


@router.get("/{table_id}/workspace/members", response_model=list[TableMemberBriefDto])
async def list_table_members(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TableMemberBriefDto]:
    table, is_owner = await _require_table_access(db, current_user, table_id)
    out: list[TableMemberBriefDto] = []

    owner_res = await db.execute(select(User).where(User.id == table.owner_id))
    owner = owner_res.scalar_one_or_none()
    if owner:
        out.append(
            TableMemberBriefDto(
                user_id=owner.id,
                short_name=_member_name(owner),
                is_owner=True,
                position=owner.position,
                role=owner.role,
            )
        )

    members_res = await db.execute(
        select(TableMember, User)
        .join(User, User.id == TableMember.user_id)
        .where(TableMember.table_id == table_id),
    )
    for _tm, user in members_res.all():
        if user.id == table.owner_id:
            continue
        out.append(
            TableMemberBriefDto(
                user_id=user.id,
                short_name=_member_name(user),
                is_owner=False,
                position=user.position,
                role=user.role,
            )
        )

    seen: set[int] = set()
    unique: list[TableMemberBriefDto] = []
    for m in out:
        if m.user_id not in seen:
            seen.add(m.user_id)
            unique.append(m)
    return unique


@router.delete("/{table_id}/workspace/members/{user_id}")
async def remove_table_member(
    table_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    table, is_owner = await _require_table_access(db, current_user, table_id)
    if not is_owner:
        raise HTTPException(status_code=403, detail="Только владелец может удалять участников стола")
    if user_id == table.owner_id:
        raise HTTPException(status_code=400, detail="Нельзя удалить владельца из стола")
    member_res = await db.execute(select(TableMember).where(TableMember.table_id == table_id, TableMember.user_id == user_id))
    member = member_res.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Участник не найден в этом столе")
    await db.delete(member)
    await db.commit()
    return {"detail": "Участник удален из стола"}


@router.get("/{table_id}/workspace/analytics", response_model=TableAnalyticsDto)
async def get_table_workspace_analytics(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    from_ts: datetime | None = Query(None, alias="from"),
    to_ts: datetime | None = Query(None, alias="to"),
    bucket: str = Query("day"),
    status_filter: str | None = Query(None, alias="status"),
    assignee_user_id: int | None = Query(None),
    service_item_id: int | None = Query(None),
) -> TableAnalyticsDto:
    if await _bonus_qty(db, table_id, "unlock_analytics") <= 0:
        raise HTTPException(status_code=403, detail="Аналитика для стола не подключена")

    table, _ = await _require_table_access(db, current_user, table_id)
    members_count = await table_members_count(db, table_id)
    rng = build_analytics_range(from_ts=from_ts, to_ts=to_ts, bucket=bucket)
    return await build_table_analytics(
        db=db,
        table_id=table.id,
        table_name=table.title,
        participants=1 + members_count,
        rng=rng,
        status_filter=status_filter,
        assignee_user_id=assignee_user_id,
        service_item_id=service_item_id,
    )


# --- Calendar ---


@router.get("/{table_id}/workspace/calendar/slots", response_model=list[CalendarSlotDto])
async def list_calendar_slots(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    from_ts: datetime | None = Query(None, alias="from"),
    to_ts: datetime | None = Query(None, alias="to"),
) -> list[CalendarSlotDto]:
    await _require_table_access(db, current_user, table_id)
    q = select(TableCalendarSlot).where(TableCalendarSlot.table_id == table_id).order_by(TableCalendarSlot.starts_at)
    if from_ts is not None:
        q = q.where(TableCalendarSlot.ends_at >= from_ts)
    if to_ts is not None:
        q = q.where(TableCalendarSlot.starts_at <= to_ts)
    res = await db.execute(q)
    slots = res.scalars().all()
    return [CalendarSlotDto(id=s.id, title=s.title, starts_at=s.starts_at, ends_at=s.ends_at) for s in slots]


@router.post("/{table_id}/workspace/calendar/slots", response_model=CalendarSlotDto)
async def create_calendar_slot(
    table_id: int,
    req: CalendarSlotCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CalendarSlotDto:
    await _require_table_access(db, current_user, table_id)
    if req.ends_at <= req.starts_at:
        raise HTTPException(status_code=400, detail="Время окончания должно быть позже начала")
    slot = TableCalendarSlot(table_id=table_id, title=req.title.strip(), starts_at=req.starts_at, ends_at=req.ends_at)
    db.add(slot)
    await db.commit()
    await db.refresh(slot)
    return CalendarSlotDto(id=slot.id, title=slot.title, starts_at=slot.starts_at, ends_at=slot.ends_at)


@router.delete("/{table_id}/workspace/calendar/slots/{slot_id}")
async def delete_calendar_slot(
    table_id: int,
    slot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    await _require_table_access(db, current_user, table_id)
    res = await db.execute(select(TableCalendarSlot).where(TableCalendarSlot.id == slot_id, TableCalendarSlot.table_id == table_id))
    slot = res.scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="Слот не найден")
    await db.execute(delete(TableCalendarSlot).where(TableCalendarSlot.id == slot_id, TableCalendarSlot.table_id == table_id))
    await db.commit()
    return {"detail": "Удалено"}


@router.post("/{table_id}/workspace/shifts/apply", response_model=ShiftScheduleApplyResponse)
async def apply_shift_schedule(
    table_id: int,
    req: ShiftScheduleApplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ShiftScheduleApplyResponse:
    table, is_owner = await _require_table_access(db, current_user, table_id)
    if req.employee_user_id == table.owner_id:
        raise HTTPException(status_code=400, detail="Для владельца смены задаются отдельно")
    employee_name = ""
    if is_owner:
        user_res = await db.execute(select(User).where(User.id == req.employee_user_id))
        employee_user = user_res.scalar_one_or_none()
        if not employee_user:
            raise HTTPException(status_code=404, detail="Сотрудник не найден")
        mem_res = await db.execute(
            select(TableMember).where(TableMember.table_id == table_id, TableMember.user_id == req.employee_user_id),
        )
        if not mem_res.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Сотрудник не найден в этом столе")
        employee_name = _member_name(employee_user)
    elif current_user.id != req.employee_user_id:
        raise HTTPException(status_code=403, detail="Можно задавать смены только для своего аккаунта")
    else:
        employee_name = _member_name(current_user)

    if not req.weekdays:
        raise HTTPException(status_code=400, detail="Выберите хотя бы один день недели")

    start_h, start_m = req.start_time.split(":")
    end_h, end_m = req.end_time.split(":")
    start_time = dtime(hour=int(start_h), minute=int(start_m), tzinfo=UTC)
    end_time = dtime(hour=int(end_h), minute=int(end_m), tzinfo=UTC)
    if (end_time.hour, end_time.minute) <= (start_time.hour, start_time.minute):
        raise HTTPException(status_code=400, detail="Время окончания должно быть позже времени начала")

    today = datetime.now(UTC).date()
    last_day = today.replace(day=today.day)
    if req.weeks_ahead > 0:
        from datetime import timedelta
        last_day = today + timedelta(days=(req.weeks_ahead * 7) - 1)

    existing_res = await db.execute(
        select(TableCalendarSlot).where(
            TableCalendarSlot.table_id == table_id,
            TableCalendarSlot.starts_at >= datetime.combine(today, dtime(0, 0, tzinfo=UTC)),
            TableCalendarSlot.starts_at <= datetime.combine(last_day, dtime(23, 59, tzinfo=UTC)),
        ),
    )
    existing = existing_res.scalars().all()
    existing_key = {(item.title, item.starts_at.isoformat(), item.ends_at.isoformat()) for item in existing}

    from datetime import timedelta
    created_count = 0
    skipped_duplicates = 0
    for offset in range(req.weeks_ahead * 7):
        current_day = today + timedelta(days=offset)
        js_weekday = (current_day.weekday() + 1) % 7
        if js_weekday not in req.weekdays:
            continue
        starts_at = datetime.combine(current_day, start_time)
        ends_at = datetime.combine(current_day, end_time)
        title = f"Смена: {employee_name}"
        key = (title, starts_at.isoformat(), ends_at.isoformat())
        if key in existing_key:
            skipped_duplicates += 1
            continue
        db.add(TableCalendarSlot(table_id=table_id, title=title, starts_at=starts_at, ends_at=ends_at))
        existing_key.add(key)
        created_count += 1

    await db.commit()
    return ShiftScheduleApplyResponse(
        detail="График смен применен",
        created_count=created_count,
        skipped_duplicates=skipped_duplicates,
    )


@router.patch("/{table_id}/workspace/calendar/slots/{slot_id}", response_model=CalendarSlotDto)
async def patch_calendar_slot(
    table_id: int,
    slot_id: int,
    req: CalendarSlotPatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CalendarSlotDto:
    await _require_table_access(db, current_user, table_id)
    res = await db.execute(select(TableCalendarSlot).where(TableCalendarSlot.id == slot_id, TableCalendarSlot.table_id == table_id))
    slot = res.scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="Слот не найден")
    if req.title is not None:
        slot.title = req.title.strip()
    starts = req.starts_at if req.starts_at is not None else slot.starts_at
    ends = req.ends_at if req.ends_at is not None else slot.ends_at
    if ends <= starts:
        raise HTTPException(status_code=400, detail="Время окончания должно быть позже начала")
    slot.starts_at = starts
    slot.ends_at = ends
    await db.commit()
    await db.refresh(slot)
    return CalendarSlotDto(id=slot.id, title=slot.title, starts_at=slot.starts_at, ends_at=slot.ends_at)


# --- Tasks ---


async def _require_tasks_bonus(db: AsyncSession, table_id: int) -> None:
    if await _bonus_qty(db, table_id, "unlock_tasks") <= 0:
        raise HTTPException(status_code=403, detail="Раздел «Задачи» не подключён для стола")


@router.get("/{table_id}/workspace/tasks", response_model=list[TableTaskDto])
async def list_tasks(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TableTaskDto]:
    await _require_table_access(db, current_user, table_id)
    if await _bonus_qty(db, table_id, "unlock_tasks") <= 0:
        return []
    res = await db.execute(select(TableTask).where(TableTask.table_id == table_id).order_by(TableTask.created_at.desc()))
    tasks = res.scalars().all()
    return [TableTaskDto(id=t.id, title=t.title, status=t.status, assignee_user_id=t.assignee_user_id) for t in tasks]


@router.post("/{table_id}/workspace/tasks", response_model=TableTaskDto)
async def create_task(
    table_id: int,
    req: TableTaskCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TableTaskDto:
    await _require_table_access(db, current_user, table_id)
    await _require_tasks_bonus(db, table_id)
    st = req.status.strip() if req.status else "new"
    if st not in ("new", "waiting", "done"):
        st = "new"
    task = TableTask(
        table_id=table_id,
        title=req.title.strip(),
        status=st,
        assignee_user_id=req.assignee_user_id,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return TableTaskDto(id=task.id, title=task.title, status=task.status, assignee_user_id=task.assignee_user_id)


@router.patch("/{table_id}/workspace/tasks/{task_id}", response_model=TableTaskDto)
async def update_task(
    table_id: int,
    task_id: int,
    req: TableTaskUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TableTaskDto:
    await _require_table_access(db, current_user, table_id)
    await _require_tasks_bonus(db, table_id)
    res = await db.execute(select(TableTask).where(TableTask.id == task_id, TableTask.table_id == table_id))
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if req.title is not None:
        task.title = req.title.strip()
    if req.status is not None:
        st = req.status.strip()
        if st in ("new", "waiting", "done"):
            task.status = st
    if req.assignee_user_id is not None:
        task.assignee_user_id = req.assignee_user_id
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return TableTaskDto(id=task.id, title=task.title, status=task.status, assignee_user_id=task.assignee_user_id)


@router.delete("/{table_id}/workspace/tasks/{task_id}")
async def delete_task(
    table_id: int,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    await _require_table_access(db, current_user, table_id)
    await _require_tasks_bonus(db, table_id)
    res = await db.execute(select(TableTask).where(TableTask.id == task_id, TableTask.table_id == table_id))
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    await db.execute(delete(TableTask).where(TableTask.id == task_id, TableTask.table_id == table_id))
    await db.commit()
    return {"detail": "Удалено"}


# --- Directories ---


@router.get("/{table_id}/workspace/directories", response_model=list[TableDirectoryDto])
async def list_directories(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TableDirectoryDto]:
    await _require_table_access(db, current_user, table_id)
    res = await db.execute(
        select(TableDirectory)
        .options(selectinload(TableDirectory.items))
        .where(TableDirectory.table_id == table_id)
        .order_by(TableDirectory.name),
    )
    dirs = res.scalars().unique().all()
    return [
        TableDirectoryDto(
            id=d.id,
            name=d.name,
            description=d.description,
            schema_fields=d.schema_fields or [],
            kind=d.kind,
            items=[_directory_item_dto(i) for i in d.items],
        )
        for d in dirs
    ]


@router.post(
    "/{table_id}/workspace/directories/repair-preset",
    response_model=PresetDirectoriesRepairResultDto,
)
async def repair_preset_workspace_directories(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PresetDirectoriesRepairResultDto:
    """Досоздаёт шаблонные справочники и примеры для старых столов (владелец)."""
    table, is_owner = await _require_table_access(db, current_user, table_id)
    if not is_owner:
        raise HTTPException(status_code=403, detail="Только владелец может восстановить шаблон справочников")
    if not preset_has_directory_template(table.preset):
        raise HTTPException(
            status_code=400,
            detail="Восстановление доступно только для столов с предустановкой «Барбершоп» или «Груминг».",
        )
    stats = await run_preset_directories_repair(db, table_id, table.preset)
    parts = []
    if stats["directories_created"]:
        parts.append(f"создано справочников: {stats['directories_created']}")
    if stats["example_items_added"]:
        parts.append(f"добавлено примеров: {stats['example_items_added']}")
    if stats["skipped_nonempty_directories"]:
        parts.append(f"без изменений (уже были данные): {stats['skipped_nonempty_directories']}")
    msg = "Готово. " + ("; ".join(parts) if parts else "Шаблон уже был на месте, новых действий не потребовалось.")
    return PresetDirectoriesRepairResultDto(detail=msg, **stats)


@router.post("/{table_id}/workspace/directories", response_model=TableDirectoryDto)
async def create_directory(
    table_id: int,
    req: TableDirectoryCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TableDirectoryDto:
    raise HTTPException(
        status_code=403,
        detail="Создание кастомных справочников отключено. Подключайте типовые шаблоны.",
    )


@router.get("/{table_id}/workspace/directories/templates", response_model=list[TemplateDirectoryStateDto])
async def list_template_directories(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TemplateDirectoryStateDto]:
    table, _ = await _require_table_access(db, current_user, table_id)
    all_templates: dict[str, str] = {}
    for entries in PRESET_DIRECTORY_SEED.values():
        for kind, name in entries:
            all_templates[kind] = name
    connected_kinds = {kind for kind, _ in directories_for_preset(table.preset)}
    dirs_res = await db.execute(
        select(TableDirectory.kind).where(
            TableDirectory.table_id == table_id,
            TableDirectory.kind.is_not(None),
        ),
    )
    enabled_kinds = {str(row[0]) for row in dirs_res.all() if row[0]}
    return [
        TemplateDirectoryStateDto(
            kind=kind,
            name=name,
            enabled=kind in enabled_kinds,
            connected=kind in connected_kinds,
        )
        for kind, name in sorted(all_templates.items(), key=lambda item: item[1])
    ]


@router.put("/{table_id}/workspace/directories/templates/{kind}", response_model=TemplateDirectoryStateDto)
async def toggle_template_directory(
    table_id: int,
    kind: str,
    req: TemplateDirectoryToggleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TemplateDirectoryStateDto:
    table, is_owner = await _require_table_access(db, current_user, table_id)
    if not is_owner:
        raise HTTPException(status_code=403, detail="Только владелец может управлять шаблонами справочников")
    all_templates: dict[str, str] = {}
    for entries in PRESET_DIRECTORY_SEED.values():
        for template_kind, name in entries:
            all_templates[template_kind] = name
    template_name = all_templates.get(kind)
    if not template_name:
        raise HTTPException(status_code=404, detail="Шаблон справочника не найден")
    if req.enabled:
        await ensure_template_directory_enabled(
            db=db,
            table_id=table_id,
            kind=kind,
            title=template_name,
            preset=table.preset,
        )
    else:
        dirs_res = await db.execute(
            select(TableDirectory).where(
                TableDirectory.table_id == table_id,
                TableDirectory.kind == kind,
            ),
        )
        directories = dirs_res.scalars().all()
        for directory in directories:
            await db.delete(directory)
        await db.commit()
    connected_kinds = {template_kind for template_kind, _ in directories_for_preset(table.preset)}
    enabled_res = await db.execute(
        select(TableDirectory.kind).where(
            TableDirectory.table_id == table_id,
            TableDirectory.kind == kind,
        ),
    )
    enabled = any(row[0] for row in enabled_res.all())
    return TemplateDirectoryStateDto(
        kind=kind,
        name=template_name,
        enabled=enabled,
        connected=kind in connected_kinds,
    )


@router.delete("/{table_id}/workspace/directories/legacy-custom", response_model=LegacyCustomDirectoriesCleanupDto)
async def cleanup_legacy_custom_directories(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LegacyCustomDirectoriesCleanupDto:
    _, is_owner = await _require_table_access(db, current_user, table_id)
    if not is_owner:
        raise HTTPException(status_code=403, detail="Только владелец может очищать кастомные справочники")
    dirs_res = await db.execute(
        select(TableDirectory).where(
            TableDirectory.table_id == table_id,
            TableDirectory.kind.is_(None),
        ),
    )
    custom_dirs = dirs_res.scalars().all()
    removed_dirs = 0
    removed_items = 0
    for directory in custom_dirs:
        cnt_res = await db.execute(
            select(func.count()).select_from(TableDirectoryItem).where(TableDirectoryItem.directory_id == directory.id),
        )
        removed_items += int(cnt_res.scalar() or 0)
        await db.delete(directory)
        removed_dirs += 1
    await db.commit()
    return LegacyCustomDirectoriesCleanupDto(
        detail="Кастомные справочники удалены",
        removed_directories=removed_dirs,
        removed_items=removed_items,
    )


@router.post("/{table_id}/workspace/directories/{directory_id}/items", response_model=DirectoryItemDto)
async def add_directory_item(
    table_id: int,
    directory_id: int,
    req: DirectoryItemCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DirectoryItemDto:
    table, is_owner = await _require_table_access(db, current_user, table_id)
    if not is_owner:
        raise HTTPException(status_code=403, detail="Только владелец может редактировать справочники")
    res = await db.execute(
        select(TableDirectory).where(TableDirectory.id == directory_id, TableDirectory.table_id == table_id),
    )
    d = res.scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="Справочник не найден")
    payload_data = req.payload
    if d.kind and payload_data is None:
        payload_data = empty_payload_for_kind(d.kind)
    item = TableDirectoryItem(
        directory_id=directory_id,
        label=req.label.strip(),
        value=req.value.strip() if req.value else None,
        payload=payload_data,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _directory_item_dto(item)


@router.patch(
    "/{table_id}/workspace/directories/{directory_id}/items/{item_id}",
    response_model=DirectoryItemDto,
)
async def patch_directory_item(
    table_id: int,
    directory_id: int,
    item_id: int,
    req: DirectoryItemPatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DirectoryItemDto:
    _, is_owner = await _require_table_access(db, current_user, table_id)
    if not is_owner:
        raise HTTPException(status_code=403, detail="Только владелец может редактировать справочники")
    res = await db.execute(
        select(TableDirectory).where(TableDirectory.id == directory_id, TableDirectory.table_id == table_id),
    )
    d = res.scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="Справочник не найден")
    ires = await db.execute(
        select(TableDirectoryItem).where(
            TableDirectoryItem.id == item_id,
            TableDirectoryItem.directory_id == directory_id,
        ),
    )
    item = ires.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Элемент не найден")
    if req.label is not None:
        item.label = req.label.strip()
    if req.value is not None:
        v = req.value.strip()
        item.value = v if v else None
    if req.payload is not None:
        item.payload = req.payload
    await db.commit()
    await db.refresh(item)
    return _directory_item_dto(item)


@router.delete("/{table_id}/workspace/directories/{directory_id}/items/{item_id}")
async def delete_directory_item(
    table_id: int,
    directory_id: int,
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    _, is_owner = await _require_table_access(db, current_user, table_id)
    if not is_owner:
        raise HTTPException(status_code=403, detail="Только владелец может удалять элементы")
    res = await db.execute(
        select(TableDirectory).where(TableDirectory.id == directory_id, TableDirectory.table_id == table_id),
    )
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Справочник не найден")
    await db.execute(
        delete(TableDirectoryItem).where(
            TableDirectoryItem.id == item_id,
            TableDirectoryItem.directory_id == directory_id,
        ),
    )
    await db.commit()
    return {"detail": "Удалено"}


@router.delete("/{table_id}/workspace/directories/{directory_id}")
async def delete_directory(
    table_id: int,
    directory_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    _, is_owner = await _require_table_access(db, current_user, table_id)
    if not is_owner:
        raise HTTPException(status_code=403, detail="Только владелец может удалять справочники")
    res = await db.execute(
        select(TableDirectory).where(TableDirectory.id == directory_id, TableDirectory.table_id == table_id),
    )
    d = res.scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="Справочник не найден")
    await db.execute(delete(TableDirectory).where(TableDirectory.id == directory_id, TableDirectory.table_id == table_id))
    await db.commit()
    return {"detail": "Удалено"}


# --- Orders ---


@router.get("/{table_id}/workspace/orders", response_model=list[TableOrderDto])
async def list_orders(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status_filter: str | None = Query(None, alias="status"),
    assignee_user_id: int | None = Query(None),
    from_ts: datetime | None = Query(None, alias="from"),
    to_ts: datetime | None = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[TableOrderDto]:
    await _require_table_access(db, current_user, table_id)
    q = select(TableOrder).where(TableOrder.table_id == table_id).order_by(TableOrder.starts_at.asc(), TableOrder.created_at.desc())
    if status_filter:
        q = q.where(TableOrder.status == status_filter)
    if assignee_user_id is not None:
        q = q.where(TableOrder.assignee_user_id == assignee_user_id)
    if from_ts is not None:
        q = q.where(TableOrder.ends_at >= from_ts)
    if to_ts is not None:
        q = q.where(TableOrder.starts_at <= to_ts)
    q = q.limit(limit).offset(offset)
    res = await db.execute(q)
    orders = res.scalars().all()
    return [_order_dto(o) for o in orders]


async def _resolve_service_total(db: AsyncSession, service_item_ids: list[int]) -> float:
    if not service_item_ids:
        return 0.0
    res = await db.execute(select(TableDirectoryItem).where(TableDirectoryItem.id.in_(service_item_ids)))
    rows = res.scalars().all()
    total = 0.0
    for row in rows:
        payload = row.payload or {}
        direct_candidates = [
            payload.get("cost"),
            payload.get("price"),
            (payload.get("inner") or {}).get("cost"),
            (payload.get("detail") or {}).get("cost"),
            row.value,
        ]
        direct_total = 0.0
        for candidate in direct_candidates:
            try:
                parsed = float(candidate or 0.0)
            except (TypeError, ValueError):
                parsed = 0.0
            if parsed > 0:
                direct_total = parsed
                break

        subservices_total = 0.0
        subservices_sources = [
            (payload.get("inner") or {}).get("subservices"),
            payload.get("subservices"),
            (payload.get("detail") or {}).get("subservices"),
        ]
        for source in subservices_sources:
            if not isinstance(source, list):
                continue
            for entry in source:
                if not isinstance(entry, dict):
                    continue
                for key in ("cost", "price"):
                    try:
                        sub_value = float(entry.get(key) or 0.0)
                    except (TypeError, ValueError):
                        sub_value = 0.0
                    if sub_value > 0:
                        subservices_total += sub_value

        total += subservices_total if subservices_total > 0 else direct_total
    return total


def _derive_order_title(order_number: str, base_title: str | None) -> str:
    if base_title and base_title.strip():
        return base_title.strip()
    return f"Заказ {order_number}"


def _next_order_number(table_id: int) -> str:
    stamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    return f"ORD-{table_id}-{stamp}"


async def _notify_order_change(
    db: AsyncSession,
    *,
    order: TableOrder,
    action: str,
    message: str,
    extra_payload: dict | None = None,
) -> None:
    payload = {"order_id": order.id, "order_number": order.order_number, "action": action, **(extra_payload or {})}
    if order.assignee_user_id:
        await create_user_notification(
            db,
            user_id=order.assignee_user_id,
            kind="order.assignee",
            title=f"Заказ {order.order_number}",
            message=message,
            payload=payload,
        )
    if order.client_directory_item_id:
        client_row = await db.get(TableDirectoryItem, order.client_directory_item_id)
        if client_row and isinstance(client_row.payload, dict):
            user_id = client_row.payload.get("user_id")
            if isinstance(user_id, int) and user_id > 0:
                await create_user_notification(
                    db,
                    user_id=user_id,
                    kind="order.client",
                    title=f"Заказ {order.order_number}",
                    message=message,
                    payload=payload,
                )


async def _append_client_history_event(
    db: AsyncSession,
    *,
    order: TableOrder,
    event: str,
    metadata: dict | None = None,
) -> None:
    if not order.client_directory_item_id:
        return
    client_row = await db.get(TableDirectoryItem, order.client_directory_item_id)
    if not client_row:
        return
    payload = dict(client_row.payload or {})
    detail = dict(payload.get("detail") or {})
    order_history = list(detail.get("orderHistory") or [])
    order_history.append(
        {
            "event": event,
            "orderId": order.id,
            "orderNumber": order.order_number,
            "startsAt": order.starts_at.isoformat(),
            "endsAt": order.ends_at.isoformat(),
            "status": order.status,
            "priceTotal": float(order.price_total or 0.0),
            "metadata": metadata or {},
            "createdAt": datetime.now(UTC).isoformat(),
        }
    )
    detail["orderHistory"] = order_history[-50:]
    payload["detail"] = detail
    client_row.payload = payload
    db.add(client_row)


@router.post("/{table_id}/workspace/orders", response_model=TableOrderDto)
async def create_order(
    table_id: int,
    req: TableOrderCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TableOrderDto:
    await _require_table_access(db, current_user, table_id)
    service_total = await _resolve_service_total(db, req.service_item_ids)
    order_number = _next_order_number(table_id)
    o = TableOrder(
        table_id=table_id,
        order_number=order_number,
        title=_derive_order_title(order_number, req.title),
        starts_at=req.starts_at,
        ends_at=req.ends_at,
        client_directory_item_id=req.client_directory_item_id,
        assignee_user_id=req.assignee_user_id,
        service_item_ids=req.service_item_ids,
        custom_directory_links=req.custom_directory_links,
        status="queued",
        price_base=service_total,
        price_adjustment=float(req.price_adjustment or 0.0),
        price_total=service_total + float(req.price_adjustment or 0.0),
        parent_order_id=req.parent_order_id,
        child_type=req.child_type,
        metadata_json=req.metadata,
    )
    if o.status == "completed":
        o.completed_at = datetime.now(UTC)
    db.add(o)
    await db.flush()
    await _append_client_history_event(db, order=o, event="created", metadata={"createdBy": current_user.id})
    await _notify_order_change(
        db,
        order=o,
        action="created",
        message=f"Создан заказ {o.order_number}",
    )
    await db.commit()
    await db.refresh(o)
    return _order_dto(o)


@router.patch("/{table_id}/workspace/orders/{order_id}", response_model=TableOrderDto)
async def update_order(
    table_id: int,
    order_id: int,
    req: TableOrderUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TableOrderDto:
    await _require_table_access(db, current_user, table_id)
    res = await db.execute(select(TableOrder).where(TableOrder.id == order_id, TableOrder.table_id == table_id))
    o = res.scalar_one_or_none()
    if not o:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    previous_assignee = o.assignee_user_id
    if req.title is not None:
        o.title = req.title.strip()
    if req.starts_at is not None:
        o.starts_at = req.starts_at
    if req.ends_at is not None:
        o.ends_at = req.ends_at
    if o.ends_at <= o.starts_at:
        raise HTTPException(status_code=400, detail="Время окончания должно быть позже начала")
    st = o.status
    if req.status is not None:
        st = req.status.strip()
        if st not in ("queued", "in_progress", "completed", "cancelled"):
            raise HTTPException(status_code=400, detail="Недопустимый статус")
        o.status = st
    if req.client_directory_item_id is not None:
        o.client_directory_item_id = req.client_directory_item_id
    if req.assignee_user_id is not None:
        o.assignee_user_id = req.assignee_user_id
    if req.service_item_ids is not None:
        o.service_item_ids = req.service_item_ids
        o.price_base = await _resolve_service_total(db, req.service_item_ids)
    if req.custom_directory_links is not None:
        o.custom_directory_links = req.custom_directory_links
    if req.price_adjustment is not None:
        o.price_adjustment = float(req.price_adjustment)
    if req.metadata is not None:
        o.metadata_json = req.metadata
    o.price_total = float(o.price_base or 0.0) + float(o.price_adjustment or 0.0)
    if st == "completed":
        o.completed_at = datetime.now(UTC)
    elif st != "completed":
        o.completed_at = None
    db.add(o)
    await _append_client_history_event(db, order=o, event="updated", metadata={"updatedBy": current_user.id})
    await _notify_order_change(
        db,
        order=o,
        action="updated",
        message=f"Заказ {o.order_number} изменён",
        extra_payload={"previous_assignee_user_id": previous_assignee},
    )
    await db.commit()
    await db.refresh(o)
    return _order_dto(o)


@router.delete("/{table_id}/workspace/orders/{order_id}")
async def delete_order(
    table_id: int,
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    await _require_table_access(db, current_user, table_id)
    res = await db.execute(select(TableOrder).where(TableOrder.id == order_id, TableOrder.table_id == table_id))
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    await _append_client_history_event(db, order=order, event="deleted", metadata={"deletedBy": current_user.id})
    await _notify_order_change(db, order=order, action="deleted", message=f"Заказ {order.order_number} удалён")
    await db.execute(delete(TableOrder).where(TableOrder.id == order_id, TableOrder.table_id == table_id))
    await db.commit()
    return {"detail": "Удалено"}


@router.post("/{table_id}/workspace/orders/{order_id}/child", response_model=TableOrderDto)
async def create_child_order(
    table_id: int,
    order_id: int,
    req: TableOrderCreateChildRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TableOrderDto:
    await _require_table_access(db, current_user, table_id)
    parent_res = await db.execute(select(TableOrder).where(TableOrder.id == order_id, TableOrder.table_id == table_id))
    parent = parent_res.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Родительский заказ не найден")
    duration = parent.ends_at - parent.starts_at
    starts_at = req.starts_at or parent.ends_at
    ends_at = req.ends_at or (starts_at + duration)
    child = TableOrder(
        table_id=table_id,
        order_number=_next_order_number(table_id),
        title=f"{parent.title} (дочерний)",
        starts_at=starts_at,
        ends_at=ends_at,
        client_directory_item_id=parent.client_directory_item_id,
        assignee_user_id=parent.assignee_user_id,
        service_item_ids=list(parent.service_item_ids or []),
        custom_directory_links=list(parent.custom_directory_links or []),
        status="queued",
        price_base=float(parent.price_base or 0.0),
        price_adjustment=float(parent.price_adjustment or 0.0),
        price_total=float(parent.price_total or 0.0),
        parent_order_id=parent.id,
        child_type=req.child_type,
        metadata_json={"derivedFrom": parent.id, "childType": req.child_type},
    )
    db.add(child)
    await db.flush()
    await _append_client_history_event(db, order=child, event="child_created", metadata={"parentOrderId": parent.id, "childType": req.child_type})
    await _notify_order_change(db, order=child, action="child_created", message=f"Создан дочерний заказ {child.order_number}")
    await db.commit()
    await db.refresh(child)
    return _order_dto(child)


@router.post("/{table_id}/workspace/orders/{order_id}/reschedule", response_model=TableOrderDto)
async def reschedule_order(
    table_id: int,
    order_id: int,
    req: TableOrderRescheduleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TableOrderDto:
    await _require_table_access(db, current_user, table_id)
    res = await db.execute(select(TableOrder).where(TableOrder.id == order_id, TableOrder.table_id == table_id))
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    order.starts_at = req.starts_at
    order.ends_at = req.ends_at
    if not req.keep_assignee:
        order.assignee_user_id = None
    db.add(order)
    await _append_client_history_event(
        db,
        order=order,
        event="rescheduled",
        metadata={"reason": req.reason, "rescheduledBy": current_user.id, "keepAssignee": req.keep_assignee},
    )
    await _notify_order_change(db, order=order, action="rescheduled", message=f"Заказ {order.order_number} перенесён")
    await db.commit()
    await db.refresh(order)
    return _order_dto(order)


@router.post("/{table_id}/workspace/orders/check-availability", response_model=OrderAvailabilityCheckResponse)
async def check_order_availability(
    table_id: int,
    req: TableOrderCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrderAvailabilityCheckResponse:
    await _require_table_access(db, current_user, table_id)
    warnings: list[OrderAvailabilityWarningDto] = []
    if req.assignee_user_id is None:
        return OrderAvailabilityCheckResponse(warnings=warnings)

    shift_res = await db.execute(
        select(TableCalendarSlot).where(
            TableCalendarSlot.table_id == table_id,
            TableCalendarSlot.title.ilike("%смена%"),
            TableCalendarSlot.starts_at <= req.starts_at,
            TableCalendarSlot.ends_at >= req.ends_at,
        )
    )
    if shift_res.scalar_one_or_none() is None:
        warnings.append(
            OrderAvailabilityWarningDto(
                code="shift_missing",
                message="У выбранного сотрудника нет подтверждённой смены на этот интервал.",
            )
        )

    overlap_res = await db.execute(
        select(func.count())
        .select_from(TableOrder)
        .where(
            TableOrder.table_id == table_id,
            TableOrder.assignee_user_id == req.assignee_user_id,
            TableOrder.status != "cancelled",
            TableOrder.starts_at < req.ends_at,
            TableOrder.ends_at > req.starts_at,
        )
    )
    overlap_count = int(overlap_res.scalar() or 0)
    if overlap_count > 0:
        warnings.append(
            OrderAvailabilityWarningDto(
                code="overlap",
                message=f"У сотрудника уже есть пересекающиеся заказы: {overlap_count}.",
            )
        )
    if overlap_count >= 3:
        warnings.append(
            OrderAvailabilityWarningDto(
                code="high_load",
                message="Высокая загрузка сотрудника в этот период.",
            )
        )
    return OrderAvailabilityCheckResponse(warnings=warnings)
