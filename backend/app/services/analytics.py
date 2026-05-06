from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from statistics import quantiles

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.table_calendar_slot import TableCalendarSlot
from app.models.table_directory import TableDirectoryItem
from app.models.table_member import TableMember
from app.models.table_order import TableOrder
from app.models.table_task import TableTask
from app.models.user import User
from app.schemas.table import (
    AnalyticsAnomalyDto,
    AnalyticsAppliedFiltersDto,
    AnalyticsBreakdownRowDto,
    AnalyticsEmployeeBreakdownRowDto,
    AnalyticsKpiDto,
    AnalyticsMiniChartDto,
    AnalyticsPeriodPointDto,
    AnalyticsSegmentDto,
    AnalyticsServiceBreakdownRowDto,
    TableAnalyticsDto,
)


Bucket = str


@dataclass
class AnalyticsRange:
    start: datetime
    end: datetime
    bucket: Bucket


def build_analytics_range(from_ts: datetime | None, to_ts: datetime | None, bucket: Bucket | None) -> AnalyticsRange:
    now = datetime.now(UTC)
    end = to_ts.astimezone(UTC) if to_ts else now
    start = from_ts.astimezone(UTC) if from_ts else end - timedelta(days=29)
    if start > end:
        start, end = end, start
    normalized_bucket = bucket if bucket in ("day", "week") else "day"
    return AnalyticsRange(start=start, end=end, bucket=normalized_bucket)


def _floor_bucket(ts: datetime, bucket: Bucket) -> datetime:
    d = ts.astimezone(UTC)
    if bucket == "week":
        monday = d - timedelta(days=d.weekday())
        return datetime(monday.year, monday.month, monday.day, tzinfo=UTC)
    return datetime(d.year, d.month, d.day, tzinfo=UTC)


def _bucket_step(bucket: Bucket) -> timedelta:
    return timedelta(days=7) if bucket == "week" else timedelta(days=1)


def _bucket_points(rng: AnalyticsRange) -> list[datetime]:
    points: list[datetime] = []
    current = _floor_bucket(rng.start, rng.bucket)
    end = _floor_bucket(rng.end, rng.bucket)
    step = _bucket_step(rng.bucket)
    while current <= end:
        points.append(current)
        current += step
    return points


def _series_template(points: list[datetime]) -> dict[datetime, int]:
    return {point: 0 for point in points}


def _format_bucket(point: datetime, bucket: Bucket) -> str:
    if bucket == "week":
        return point.strftime("%Y-W%W")
    return point.strftime("%Y-%m-%d")


async def build_table_analytics(
    db: AsyncSession,
    table_id: int,
    table_name: str,
    participants: int,
    rng: AnalyticsRange,
    status_filter: str | None = None,
    assignee_user_id: int | None = None,
    service_item_id: int | None = None,
) -> TableAnalyticsDto:
    points = _bucket_points(rng)
    created_orders = _series_template(points)
    completed_orders = _series_template(points)
    queued_series = _series_template(points)
    tasks_new_series = _series_template(points)
    tasks_waiting_series = _series_template(points)
    tasks_done_series = _series_template(points)
    calendar_hours_series = _series_template(points)

    orders_query = select(
        TableOrder.created_at,
        TableOrder.completed_at,
        TableOrder.status,
        TableOrder.price_total,
        TableOrder.parent_order_id,
        TableOrder.assignee_user_id,
        TableOrder.service_item_ids,
    ).where(
        TableOrder.table_id == table_id,
        TableOrder.created_at >= rng.start,
        TableOrder.created_at <= rng.end,
    )
    if status_filter:
        orders_query = orders_query.where(TableOrder.status == status_filter)
    if assignee_user_id is not None:
        orders_query = orders_query.where(TableOrder.assignee_user_id == assignee_user_id)
    orders_res = await db.execute(orders_query)
    orders = orders_res.all()
    if service_item_id is not None:
        orders = [row for row in orders if service_item_id in (row[6] or [])]

    tasks_query = select(TableTask.created_at, TableTask.status).where(
        TableTask.table_id == table_id,
        TableTask.created_at >= rng.start,
        TableTask.created_at <= rng.end,
    )
    if assignee_user_id is not None:
        tasks_query = tasks_query.where(TableTask.assignee_user_id == assignee_user_id)
    tasks_res = await db.execute(tasks_query)
    tasks = tasks_res.all()

    slots_res = await db.execute(
        select(TableCalendarSlot).where(
            TableCalendarSlot.table_id == table_id,
            TableCalendarSlot.starts_at <= rng.end,
            TableCalendarSlot.ends_at >= rng.start,
        ),
    )
    slots = slots_res.scalars().all()
    active_slot_employee_keys: set[str] = set()

    queued_current_res = await db.execute(
        select(func.count())
        .select_from(TableOrder)
        .where(TableOrder.table_id == table_id, TableOrder.status == "queued"),
    )
    queued_current = int(queued_current_res.scalar() or 0)
    new_orders_24h_res = await db.execute(
        select(func.count())
        .select_from(TableOrder)
        .where(
            TableOrder.table_id == table_id,
            TableOrder.created_at >= datetime.now(UTC) - timedelta(hours=24),
            TableOrder.created_at <= datetime.now(UTC),
        ),
    )
    new_orders_24h = int(new_orders_24h_res.scalar() or 0)

    task_status_res = await db.execute(
        select(TableTask.status, func.count())
        .where(TableTask.table_id == table_id)
        .group_by(TableTask.status),
    )
    task_status_counts = {status: int(count) for status, count in task_status_res.all()}
    tasks_new_current = task_status_counts.get("new", 0)
    tasks_waiting_only_current = task_status_counts.get("waiting", 0)
    tasks_done_current = task_status_counts.get("done", 0)
    tasks_waiting_current = tasks_new_current + tasks_waiting_only_current
    tasks_created_total = tasks_done_current + tasks_waiting_current
    task_progress_percent = round((tasks_done_current / tasks_created_total) * 100.0, 2) if tasks_created_total > 0 else 0.0

    assignee_res = await db.execute(
        select(TableTask.assignee_user_id, func.count())
        .where(
            TableTask.table_id == table_id,
            TableTask.status.in_(("new", "waiting")),
            TableTask.assignee_user_id.is_not(None),
        )
        .group_by(TableTask.assignee_user_id),
    )
    assignee_values = sorted((int(count) for _, count in assignee_res.all()), reverse=True)[:10]

    cancelled_total = 0
    rescheduled_total = 0
    repeat_total = 0
    child_total = 0
    revenue_total = 0.0
    assignee_load: dict[int, int] = {}
    service_stats: dict[int, dict[str, float]] = {}
    employee_stats: dict[int, dict[str, float]] = {}
    for created_at, completed_at, status, price_total, parent_order_id, assignee_user_id, service_item_ids in orders:
        key = _floor_bucket(created_at, rng.bucket)
        if key in created_orders:
            created_orders[key] += 1
        if completed_at:
            c_key = _floor_bucket(completed_at, rng.bucket)
            if c_key in completed_orders:
                completed_orders[c_key] += 1
        if status == "cancelled":
            cancelled_total += 1
        if parent_order_id is not None:
            child_total += 1
            repeat_total += 1
        revenue_total += float(price_total or 0.0)
        order_revenue = float(price_total or 0.0)
        for sid in list(service_item_ids or []):
            metric = service_stats.setdefault(int(sid), {"orders": 0.0, "revenue": 0.0})
            metric["orders"] += 1.0
            metric["revenue"] += order_revenue
        if assignee_user_id is not None:
            uid = int(assignee_user_id)
            assignee_load[uid] = assignee_load.get(uid, 0) + 1
            est = employee_stats.setdefault(
                uid,
                {"orders": 0.0, "completed": 0.0, "cancelled": 0.0, "revenue": 0.0},
            )
            est["orders"] += 1.0
            est["revenue"] += order_revenue
            if status == "completed":
                est["completed"] += 1.0
            if status == "cancelled":
                est["cancelled"] += 1.0

    cycle_minutes: list[float] = []
    for created_at, completed_at, _status, _price_total, _parent_order_id, _assignee_user_id, _service_item_ids in orders:
        if completed_at:
            delta = completed_at - created_at
            cycle_minutes.append(max(delta.total_seconds() / 60.0, 0.0))

    for point in points:
        queued_series[point] = queued_current

    for created_at, status in tasks:
        key = _floor_bucket(created_at, rng.bucket)
        if key not in tasks_new_series:
            continue
        if status == "done":
            tasks_done_series[key] += 1
        elif status == "waiting":
            tasks_waiting_series[key] += 1
        else:
            tasks_new_series[key] += 1

    for slot in slots:
        key = _floor_bucket(slot.starts_at, rng.bucket)
        if key in calendar_hours_series:
            hours = max((slot.ends_at - slot.starts_at).total_seconds() / 3600.0, 0.0)
            calendar_hours_series[key] += int(round(hours))
        title_key = (slot.title or "").strip().lower()
        if title_key:
            active_slot_employee_keys.add(title_key)
    active_employees = len(active_slot_employee_keys)

    created_values = list(created_orders.values())
    completed_values = list(completed_orders.values())
    queue_values = list(queued_series.values())
    calendar_values = list(calendar_hours_series.values())

    orders_created_total = sum(created_values)
    orders_completed_total = sum(completed_values)
    completion_rate = (orders_completed_total / orders_created_total * 100.0) if orders_created_total > 0 else 0.0
    avg_cycle = round(sum(cycle_minutes) / len(cycle_minutes), 2) if cycle_minutes else 0.0
    p90_cycle = 0.0
    if len(cycle_minutes) >= 2:
        p90_cycle = round(quantiles(cycle_minutes, n=10, method="inclusive")[8], 2)
    elif cycle_minutes:
        p90_cycle = cycle_minutes[0]

    labels = [_format_bucket(point, rng.bucket) for point in points]
    periods = [
        AnalyticsPeriodPointDto(period=label, values=[created_values[idx], completed_values[idx], queue_values[idx]])
        for idx, label in enumerate(labels)
    ]

    segments = [
        AnalyticsSegmentDto(key="tasks_new", label="Новые заказы (24ч)", value=float(new_orders_24h)),
        AnalyticsSegmentDto(key="tasks_waiting", label="В ожидании", value=float(tasks_waiting_current)),
        AnalyticsSegmentDto(key="tasks_done", label="Выполнены", value=float(tasks_done_current)),
    ]
    segments.extend(
        AnalyticsSegmentDto(key=f"assignee_{index + 1}", label=f"Сотрудник {index + 1}", value=float(value))
        for index, value in enumerate(assignee_values[:5])
    )

    anomalies: list[AnalyticsAnomalyDto] = []
    if queue_values:
        avg_queue = sum(queue_values) / len(queue_values)
        peak_queue = max(queue_values)
        if avg_queue > 0 and peak_queue >= avg_queue * 1.5:
            peak_idx = queue_values.index(peak_queue)
            anomalies.append(
                AnalyticsAnomalyDto(
                    date=labels[peak_idx],
                    title=f"Всплеск очереди до {peak_queue}",
                    severity="medium",
                ),
            )

    prev_start = rng.start - (rng.end - rng.start) - timedelta(seconds=1)
    prev_end = rng.start - timedelta(seconds=1)
    prev_orders_res = await db.execute(
        select(func.count())
        .select_from(TableOrder)
        .where(TableOrder.table_id == table_id, TableOrder.created_at >= prev_start, TableOrder.created_at <= prev_end),
    )
    prev_completed_res = await db.execute(
        select(func.count())
        .select_from(TableOrder)
        .where(TableOrder.table_id == table_id, TableOrder.completed_at >= prev_start, TableOrder.completed_at <= prev_end),
    )
    prev_created = int(prev_orders_res.scalar() or 0)
    prev_completed = int(prev_completed_res.scalar() or 0)

    def delta_pct(curr: float, prev: float) -> float:
        if prev == 0:
            return 0.0
        return round(((curr - prev) / prev) * 100.0, 2)

    average_check = round(revenue_total / orders_created_total, 2) if orders_created_total > 0 else 0.0
    assignee_peak = max(assignee_load.values()) if assignee_load else 0
    kpis = [
        AnalyticsKpiDto(key="active_employees", title="Активные сотрудники", value=float(active_employees), unit="чел", delta_percent=None),
        AnalyticsKpiDto(key="queued_orders", title="Очередь сейчас", value=float(queued_current), unit="шт"),
        AnalyticsKpiDto(key="task_progress_percent", title="Прогресс задач", value=task_progress_percent, unit="%", delta_percent=None),
        AnalyticsKpiDto(key="tasks_done", title="Выполненные задачи", value=float(tasks_done_current), unit="шт"),
        AnalyticsKpiDto(key="tasks_waiting", title="В ожидании", value=float(tasks_waiting_current), unit="шт"),
        AnalyticsKpiDto(key="new_orders_24h", title="Новые за 24 часа", value=float(new_orders_24h), unit="шт"),
        AnalyticsKpiDto(
            key="orders_created",
            title="Создано заказов",
            value=float(orders_created_total),
            unit="шт",
            delta_percent=delta_pct(float(orders_created_total), float(prev_created)),
        ),
        AnalyticsKpiDto(
            key="orders_completed",
            title="Завершено заказов",
            value=float(orders_completed_total),
            unit="шт",
            delta_percent=delta_pct(float(orders_completed_total), float(prev_completed)),
        ),
        AnalyticsKpiDto(key="completion_rate", title="Доля завершения", value=round(completion_rate, 2), unit="%", delta_percent=None),
        AnalyticsKpiDto(key="avg_cycle_time_minutes", title="Средний цикл заказа", value=avg_cycle, unit="мин", delta_percent=None),
        AnalyticsKpiDto(key="p90_cycle_time_minutes", title="P90 цикла заказа", value=p90_cycle, unit="мин", delta_percent=None),
        AnalyticsKpiDto(
            key="calendar_hours_period",
            title="Календарная загрузка",
            value=float(sum(calendar_values)),
            unit="ч",
            delta_percent=None,
        ),
        AnalyticsKpiDto(key="revenue_total", title="Выручка", value=round(revenue_total, 2), unit="₽", delta_percent=None),
        AnalyticsKpiDto(key="average_check", title="Средний чек", value=average_check, unit="₽", delta_percent=None),
        AnalyticsKpiDto(key="cancelled_total", title="Отмены", value=float(cancelled_total), unit="шт", delta_percent=None),
        AnalyticsKpiDto(key="rescheduled_total", title="Переносы", value=float(rescheduled_total), unit="шт", delta_percent=None),
        AnalyticsKpiDto(key="child_orders_total", title="Дочерние заказы", value=float(child_total), unit="шт", delta_percent=None),
        AnalyticsKpiDto(key="repeated_total", title="Повторные заказы", value=float(repeat_total), unit="шт", delta_percent=None),
        AnalyticsKpiDto(key="assignee_peak_load", title="Пик нагрузки сотрудника", value=float(assignee_peak), unit="шт", delta_percent=None),
    ]

    service_labels: dict[int, str] = {}
    if service_stats:
        service_ids = list(service_stats.keys())
        service_rows_res = await db.execute(select(TableDirectoryItem.id, TableDirectoryItem.label).where(TableDirectoryItem.id.in_(service_ids)))
        service_labels = {int(row[0]): str(row[1]) for row in service_rows_res.all()}
    employee_labels: dict[int, str] = {}
    if employee_stats:
        employee_ids = list(employee_stats.keys())
        employee_rows_res = await db.execute(select(User.id, User.last_name, User.first_name).where(User.id.in_(employee_ids)))
        for uid, last_name, first_name in employee_rows_res.all():
            ln = (last_name or "").strip()
            fn = (first_name or "").strip()
            employee_labels[int(uid)] = f"{ln} {fn}".strip() or f"Сотрудник #{uid}"

    service_breakdown = sorted(
        [
            AnalyticsServiceBreakdownRowDto(
                service_item_id=sid,
                label=service_labels.get(sid, f"Услуга #{sid}"),
                orders_total=int(vals["orders"]),
                revenue_total=round(float(vals["revenue"]), 2),
                average_check=round(float(vals["revenue"]) / float(vals["orders"]), 2) if vals["orders"] > 0 else 0.0,
            )
            for sid, vals in service_stats.items()
        ],
        key=lambda row: row.revenue_total,
        reverse=True,
    )
    employee_breakdown = sorted(
        [
            AnalyticsEmployeeBreakdownRowDto(
                assignee_user_id=uid,
                label=employee_labels.get(uid, f"Сотрудник #{uid}"),
                orders_total=int(vals["orders"]),
                completed_total=int(vals["completed"]),
                cancelled_total=int(vals["cancelled"]),
                revenue_total=round(float(vals["revenue"]), 2),
                load_total=int(assignee_load.get(uid, 0)),
            )
            for uid, vals in employee_stats.items()
        ],
        key=lambda row: row.orders_total,
        reverse=True,
    )

    breakdown = [
        AnalyticsBreakdownRowDto(label="Участников", value=float(participants)),
        AnalyticsBreakdownRowDto(label="Активные сотрудники", value=float(active_employees)),
        AnalyticsBreakdownRowDto(label="Заказов создано", value=float(orders_created_total)),
        AnalyticsBreakdownRowDto(label="Заказов завершено", value=float(orders_completed_total)),
        AnalyticsBreakdownRowDto(label="Очередь сейчас", value=float(queued_current)),
        AnalyticsBreakdownRowDto(label="Прогресс задач", value=task_progress_percent),
        AnalyticsBreakdownRowDto(label="Прогресс задач (выполнено/создано)", value=float(tasks_done_current)),
        AnalyticsBreakdownRowDto(label="Задач создано", value=float(tasks_created_total)),
        AnalyticsBreakdownRowDto(label="В ожидании", value=float(tasks_waiting_current)),
        AnalyticsBreakdownRowDto(label="Новые за 24 часа", value=float(new_orders_24h)),
        AnalyticsBreakdownRowDto(label="Суммарные часы календаря", value=float(sum(calendar_values))),
        AnalyticsBreakdownRowDto(label="Выручка", value=round(revenue_total, 2)),
        AnalyticsBreakdownRowDto(label="Средний чек", value=average_check),
        AnalyticsBreakdownRowDto(label="Дочерние заказы", value=float(child_total)),
    ]

    return TableAnalyticsDto(
        table_id=table_id,
        table_name=table_name,
        participants=participants,
        active_employees=active_employees,
        queued_orders=queued_current,
        charts=[
            AnalyticsMiniChartDto(title="Создано заказов", subtitle=f"шт / {rng.bucket}", values=created_values),
            AnalyticsMiniChartDto(title="Завершено заказов", subtitle=f"шт / {rng.bucket}", values=completed_values),
            AnalyticsMiniChartDto(title="Очередь", subtitle=f"шт / {rng.bucket}", values=queue_values),
            AnalyticsMiniChartDto(title="Новые задачи", subtitle=f"шт / {rng.bucket}", values=list(tasks_new_series.values())),
            AnalyticsMiniChartDto(title="Ожидающие задачи", subtitle=f"шт / {rng.bucket}", values=list(tasks_waiting_series.values())),
            AnalyticsMiniChartDto(title="Календарная загрузка", subtitle=f"ч / {rng.bucket}", values=calendar_values),
        ],
        kpis=kpis,
        periods=periods,
        segments=segments,
        anomalies=anomalies,
        breakdown=breakdown,
        service_breakdown=service_breakdown,
        employee_breakdown=employee_breakdown,
        applied_filters=AnalyticsAppliedFiltersDto(
            status=status_filter,
            assignee_user_id=assignee_user_id,
            service_item_id=service_item_id,
            bucket=rng.bucket,
        ),
        task_progress_done=tasks_done_current,
        task_progress_total=tasks_created_total,
        task_progress_percent=task_progress_percent,
    )


async def table_members_count(db: AsyncSession, table_id: int) -> int:
    members_res = await db.execute(select(TableMember).where(TableMember.table_id == table_id))
    return len(members_res.scalars().all())
