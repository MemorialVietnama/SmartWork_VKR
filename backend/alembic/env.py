import asyncio
import json
import time
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy import text

from app.core.config import settings
from app.db.base import Base
import app.models

# Подключаем метаданные моделей к Alembic при появлении моделей:
# from app.models import user  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _debug_log(message: str, data: dict, hypothesis_id: str, run_id: str = "run1") -> None:
    payload = {
        "sessionId": "f3eb11",
        "runId": run_id,
        "hypothesisId": hypothesis_id,
        "location": "backend/alembic/env.py",
        "message": message,
        "data": data,
        "timestamp": int(time.time() * 1000),
    }
    Path("debug-f3eb11.log").open("a", encoding="utf-8").write(json.dumps(payload, ensure_ascii=False) + "\n")


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    # region agent log
    _debug_log(
        "alembic_async_start",
        {"db_host_hint": settings.DATABASE_URL.rsplit("@", 1)[-1]},
        "H1",
    )
    # endregion
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
        users_table = (await connection.execute(text("SELECT to_regclass('public.users')"))).scalar_one_or_none()
        # region agent log
        _debug_log(
            "alembic_async_done",
            {"users_table_regclass": users_table},
            "H2",
        )
        # endregion

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
