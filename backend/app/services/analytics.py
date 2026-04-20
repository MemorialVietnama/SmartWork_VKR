from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from statistics import quantiles

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.table_calendar_slot import TableCalendarSlot
from app.models.table_member import TableMember
from app.models.table_order import TableOrder
from app.models.table_task import TableTask
from app.schemas.table import (
    AnalyticsAnomalyDto,
    AnalyticsBreakdownRowDto,
    AnalyticsKpiDto,
    AnalyticsMiniChartDto,
    AnalyticsPeriodPointDto,
    AnalyticsSegmentDto,
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
    active_employees: int,
    rng: AnalyticsRange,
) -> TableAnalyticsDto:
    points = _bucket_points(rng)
    created_orders = _series_template(points)
    completed_orders = _series_template(points)
    queued_series = _series_template(points)
    tasks_new_series = _series_template(points)
    tasks_waiting_series = _series_template(points)
    tasks_done_series = _series_template(points)
    calendar_hours_series = _series_template(points)

    orders_res = await db.execute(
        select(TableOrder.created_at, TableOrder.completed_at).where(
            TableOrder.table_id == table_id,
            TableOrder.created_at >= rng.start,
            TableOrder.created_at <= rng.end,
        ),
    )
    orders = orders_res.all()

    tasks_res = await db.execute(
        select(TableTask.created_at, TableTask.status).where(
            TableTask.table_id == table_id,
            TableTask.created_at >= rng.start,
            TableTask.created_at <= rng.end,
        ),
    )
    tasks = tasks_res.all()

    slots_res = await db.execute(
        select(TableCalendarSlot).where(
            TableCalendarSlot.table_id == table_id,
            TableCalendarSlot.starts_at <= rng.end,
            TableCalendarSlot.ends_at >= rng.start,
        ),
    )
    slots = slots_res.scalars().all()

    queued_current_res = await db.execute(
        select(func.count())
        .select_from(TableOrder)
        .where(TableOrder.table_id == table_id, TableOrder.status == "queued"),
    )
    queued_current = int(queued_current_res.scalar() or 0)

    task_status_res = await db.execute(
        select(TableTask.status, func.count())
        .where(TableTask.table_id == table_id)
        .group_by(TableTask.status),
    )
    task_status_counts = {status: int(count) for status, count in task_status_res.all()}
    tasks_new_current = task_status_counts.get("new", 0)
    tasks_waiting_current = task_status_counts.get("waiting", 0)
    tasks_done_current = task_status_counts.get("done", 0)

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

    for created_at, completed_at in orders:
        key = _floor_bucket(created_at, rng.bucket)
        if key in created_orders:
            created_orders[key] += 1
        if completed_at:
            c_key = _floor_bucket(completed_at, rng.bucket)
            if c_key in completed_orders:
                completed_orders[c_key] += 1

    cycle_minutes: list[float] = []
    for created_at, completed_at in orders:
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
        AnalyticsSegmentDto(key="tasks_new", label="Новые задачи", value=float(tasks_new_current)),
        AnalyticsSegmentDto(key="tasks_waiting", label="Ожидают", value=float(tasks_waiting_current)),
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

    kpis = [
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
        AnalyticsKpiDto(key="queued_orders", title="Очередь сейчас", value=float(queued_current), unit="шт"),
        AnalyticsKpiDto(key="tasks_new", title="Новые задачи", value=float(tasks_new_current), unit="шт"),
        AnalyticsKpiDto(key="tasks_waiting", title="Ожидающие задачи", value=float(tasks_waiting_current), unit="шт"),
        AnalyticsKpiDto(key="tasks_done", title="Выполненные задачи", value=float(tasks_done_current), unit="шт"),
        AnalyticsKpiDto(key="avg_cycle_time_minutes", title="Средний цикл заказа", value=avg_cycle, unit="мин", delta_percent=None),
        AnalyticsKpiDto(key="p90_cycle_time_minutes", title="P90 цикла заказа", value=p90_cycle, unit="мин", delta_percent=None),
        AnalyticsKpiDto(
            key="calendar_hours_period",
            title="Календарная загрузка",
            value=float(sum(calendar_values)),
            unit="ч",
            delta_percent=None,
        ),
        AnalyticsKpiDto(key="active_employees", title="Активные сотрудники", value=float(active_employees), unit="чел", delta_percent=None),
    ]

    breakdown = [
        AnalyticsBreakdownRowDto(label="Участников", value=float(participants)),
        AnalyticsBreakdownRowDto(label="Активные сотрудники", value=float(active_employees)),
        AnalyticsBreakdownRowDto(label="Заказов создано", value=float(orders_created_total)),
        AnalyticsBreakdownRowDto(label="Заказов завершено", value=float(orders_completed_total)),
        AnalyticsBreakdownRowDto(label="Очередь сейчас", value=float(queued_current)),
        AnalyticsBreakdownRowDto(label="Суммарные часы календаря", value=float(sum(calendar_values))),
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
    )


async def table_members_count(db: AsyncSession, table_id: int) -> int:
    members_res = await db.execute(select(TableMember).where(TableMember.table_id == table_id))
    return len(members_res.scalars().all())
