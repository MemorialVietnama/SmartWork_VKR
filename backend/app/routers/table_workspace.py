from __future__ import annotations

from datetime import UTC, datetime

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
from app.schemas.table_workspace import (
    CalendarSlotCreateRequest,
    CalendarSlotDto,
    DirectoryItemCreateRequest,
    DirectoryItemDto,
    TableDetailDto,
    TableDirectoryCreateRequest,
    TableDirectoryDto,
    TableMemberBriefDto,
    TableOrderCreateRequest,
    TableOrderDto,
    TableOrderUpdateRequest,
    TableTaskCreateRequest,
    TableTaskDto,
    TableTaskUpdateRequest,
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
            items=[DirectoryItemDto(id=i.id, label=i.label, value=i.value) for i in d.items],
        )
        for d in dirs
    ]


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
    count_res = await db.execute(select(func.count()).select_from(TableDirectory).where(TableDirectory.table_id == table_id))
    current_count = int(count_res.scalar() or 0)
    if current_count >= max_n:
        raise HTTPException(status_code=403, detail="Достигнут лимит справочников для стола")
    d = TableDirectory(table_id=table_id, name=req.name.strip())
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return TableDirectoryDto(id=d.id, name=d.name, items=[])


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
    item = TableDirectoryItem(directory_id=directory_id, label=req.label.strip(), value=req.value.strip() if req.value else None)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return DirectoryItemDto(id=item.id, label=item.label, value=item.value)


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
