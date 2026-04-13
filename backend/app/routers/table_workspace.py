from __future__ import annotations

from datetime import UTC, datetime
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
from app.schemas.table import AnalyticsMiniChartDto, TableAnalyticsDto, TableBonusDto, TableStatDto
from app.config.directory_presets import empty_payload_for_kind, preset_has_directory_template
from app.services.directory_bootstrap import repair_preset_directories as run_preset_directories_repair
from app.schemas.table_workspace import (
    CalendarSlotCreateRequest,
    CalendarSlotPatchRequest,
    CalendarSlotDto,
    DirectoryItemCreateRequest,
    DirectoryItemDto,
    DirectoryItemPatchRequest,
    PresetDirectoriesRepairResultDto,
    TableDetailDto,
    TablePatchRequest,
    TableDirectoryCreateRequest,
    TableDirectoryDto,
    TableMemberBriefDto,
    TableOrderCreateRequest,
    TableOrderDto,
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


async def _compute_stats(db: AsyncSession, table_id: int, member_count: int) -> TableStatDto:
    q_queued = await db.execute(
        select(func.count()).select_from(TableOrder).where(TableOrder.table_id == table_id, TableOrder.status == "queued"),
    )
    queued = int(q_queued.scalar() or 0)

    td = await db.execute(select(func.count()).select_from(TableTask).where(TableTask.table_id == table_id, TableTask.status == "done"))
    tw = await db.execute(select(func.count()).select_from(TableTask).where(TableTask.table_id == table_id, TableTask.status == "waiting"))
    tn = await db.execute(select(func.count()).select_from(TableTask).where(TableTask.table_id == table_id, TableTask.status == "new"))

    return TableStatDto(
        active_employees=max(0, member_count),
        queued_orders=queued,
        tasks_done=int(td.scalar() or 0),
        tasks_waiting=int(tw.scalar() or 0),
        tasks_new=int(tn.scalar() or 0),
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
        out.append(TableMemberBriefDto(user_id=owner.id, short_name=_member_name(owner), is_owner=True))

    members_res = await db.execute(
        select(TableMember, User)
        .join(User, User.id == TableMember.user_id)
        .where(TableMember.table_id == table_id),
    )
    for _tm, user in members_res.all():
        if user.id == table.owner_id:
            continue
        out.append(TableMemberBriefDto(user_id=user.id, short_name=_member_name(user), is_owner=False))

    seen: set[int] = set()
    unique: list[TableMemberBriefDto] = []
    for m in out:
        if m.user_id not in seen:
            seen.add(m.user_id)
            unique.append(m)
    return unique


@router.get("/{table_id}/workspace/analytics", response_model=TableAnalyticsDto)
async def get_table_workspace_analytics(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TableAnalyticsDto:
    if await _bonus_qty(db, table_id, "unlock_analytics") <= 0:
        raise HTTPException(status_code=403, detail="Аналитика для стола не подключена")

    table, _ = await _require_table_access(db, current_user, table_id)
    detail = await get_table_detail(table_id, db, current_user)
    stats = detail.stats
    load_base = max(stats.tasks_done + stats.tasks_waiting + stats.tasks_new, 1)
    queued_base = max(stats.queued_orders, 1)
    active_base = max(stats.active_employees, 1)

    return TableAnalyticsDto(
        table_id=table.id,
        table_name=table.title,
        participants=detail.total_participants,
        active_employees=stats.active_employees,
        queued_orders=stats.queued_orders,
        charts=[
            AnalyticsMiniChartDto(
                title="Заказы за 7 дней",
                subtitle="шт / день",
                values=[queued_base + i % 3 for i in range(7)],
            ),
            AnalyticsMiniChartDto(
                title="Новые задачи",
                subtitle="шт / день",
                values=[stats.tasks_new + i % 2 for i in range(7)],
            ),
            AnalyticsMiniChartDto(
                title="Закрытые задачи",
                subtitle="шт / день",
                values=[stats.tasks_done + i % 2 for i in range(7)],
            ),
            AnalyticsMiniChartDto(
                title="Загрузка сотрудников",
                subtitle="усл. индекс",
                values=[active_base + (load_base // 4) + i for i in range(7)],
            ),
            AnalyticsMiniChartDto(
                title="Записи в очереди",
                subtitle="шт / день",
                values=[queued_base + (i % 2) for i in range(7)],
            ),
            AnalyticsMiniChartDto(
                title="Нагрузка стола",
                subtitle="усл. индекс",
                values=[load_base + i % 3 for i in range(7)],
            ),
        ],
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
    table, is_owner = await _require_table_access(db, current_user, table_id)
    if not is_owner:
        raise HTTPException(status_code=403, detail="Только владелец может создавать справочники")
    max_n = await _directory_slot_limit(db, table_id)
    count_res = await db.execute(
        select(func.count()).select_from(TableDirectory).where(
            TableDirectory.table_id == table_id,
            TableDirectory.kind.is_(None),
        ),
    )
    current_count = int(count_res.scalar() or 0)
    if current_count >= max_n:
        raise HTTPException(status_code=403, detail="Достигнут лимит справочников для стола")
    d = TableDirectory(table_id=table_id, name=req.name.strip(), kind=None)
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return TableDirectoryDto(id=d.id, name=d.name, kind=d.kind, items=[])


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
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[TableOrderDto]:
    await _require_table_access(db, current_user, table_id)
    q = select(TableOrder).where(TableOrder.table_id == table_id).order_by(TableOrder.created_at.desc())
    if status_filter:
        q = q.where(TableOrder.status == status_filter)
    q = q.limit(limit).offset(offset)
    res = await db.execute(q)
    orders = res.scalars().all()
    return [
        TableOrderDto(id=o.id, title=o.title, status=o.status, created_at=o.created_at, completed_at=o.completed_at)
        for o in orders
    ]


@router.post("/{table_id}/workspace/orders", response_model=TableOrderDto)
async def create_order(
    table_id: int,
    req: TableOrderCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TableOrderDto:
    await _require_table_access(db, current_user, table_id)
    o = TableOrder(table_id=table_id, title=req.title.strip(), status="queued")
    db.add(o)
    await db.commit()
    await db.refresh(o)
    return TableOrderDto(id=o.id, title=o.title, status=o.status, created_at=o.created_at, completed_at=o.completed_at)


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
    st = req.status.strip()
    if st not in ("queued", "in_progress", "completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Недопустимый статус")
    o.status = st
    if st == "completed":
        o.completed_at = datetime.now(UTC)
    elif st != "completed":
        o.completed_at = None
    db.add(o)
    await db.commit()
    await db.refresh(o)
    return TableOrderDto(id=o.id, title=o.title, status=o.status, created_at=o.created_at, completed_at=o.completed_at)
