from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import func, select

from app.config.directory_presets import canonical_preset, directories_for_preset, seed_items_for_directory
from app.models.table_directory import TableDirectory, TableDirectoryItem


async def repair_preset_directories(db: AsyncSession, table_id: int, preset: str | None) -> dict[str, int]:
    """Досоздаёт отсутствующие справочники по шаблону и примеры в пустых шаблонных справочниках.

    Не дублирует элементы, если в справочнике с kind уже есть записи.
    """
    canon = canonical_preset(preset) if preset else None
    if not canon and preset:
        canon = preset.strip().lower()

    directories_created = 0
    example_items_added = 0
    skipped_nonempty_directories = 0

    for kind, title in directories_for_preset(preset):
        res = await db.execute(
            select(TableDirectory)
            .where(TableDirectory.table_id == table_id, TableDirectory.kind == kind)
            .limit(1),
        )
        d = res.scalars().first()
        if d is None:
            d = TableDirectory(table_id=table_id, name=title, kind=kind)
            db.add(d)
            await db.flush()
            directories_created += 1
            for label, payload in seed_items_for_directory(kind, canon or ""):
                db.add(
                    TableDirectoryItem(
                        directory_id=d.id,
                        label=label,
                        value=None,
                        payload=payload,
                    ),
                )
                example_items_added += 1
            continue

        cnt_res = await db.execute(
            select(func.count()).select_from(TableDirectoryItem).where(TableDirectoryItem.directory_id == d.id),
        )
        n = int(cnt_res.scalar() or 0)
        if n == 0:
            for label, payload in seed_items_for_directory(kind, canon or ""):
                db.add(
                    TableDirectoryItem(
                        directory_id=d.id,
                        label=label,
                        value=None,
                        payload=payload,
                    ),
                )
                example_items_added += 1
        else:
            skipped_nonempty_directories += 1

    await db.commit()
    return {
        "directories_created": directories_created,
        "example_items_added": example_items_added,
        "skipped_nonempty_directories": skipped_nonempty_directories,
    }


async def bootstrap_preset_directories(db: AsyncSession, table_id: int, preset: str | None) -> None:
    """Создаёт справочники по предустановке (не считаются в лимит extra_directories).

    Для каждого справочника добавляет по два примера элементов с заполненным payload.
    """
    canon = canonical_preset(preset) if preset else None
    if not canon and preset:
        canon = preset.strip().lower()

    for kind, title in directories_for_preset(preset):
        d = TableDirectory(table_id=table_id, name=title, kind=kind)
        db.add(d)
        await db.flush()
        for label, payload in seed_items_for_directory(kind, canon or ""):
            db.add(
                TableDirectoryItem(
                    directory_id=d.id,
                    label=label,
                    value=None,
                    payload=payload,
                ),
            )
    await db.commit()
