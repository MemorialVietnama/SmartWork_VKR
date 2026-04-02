from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base
from app.db.session import engine
from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User
from app.routers import system as system_router
from app.routers import auth as auth_router
from app.routers import tables as tables_router
from app.routers import settings as settings_router
from app.routers import employees as employees_router
from app.routers import table_workspace as table_workspace_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    import app.models  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100)"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30)"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data_url VARCHAR(4000)"))
        await conn.execute(text("ALTER TABLE users ALTER COLUMN avatar_data_url TYPE TEXT"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS position VARCHAR(120)"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS note VARCHAR(500)"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)"))
        await conn.execute(text("ALTER TABLE tables ADD COLUMN IF NOT EXISTS preset VARCHAR(50)"))
        await conn.execute(text("ALTER TABLE tables ADD COLUMN IF NOT EXISTS custom_preset_name VARCHAR(80)"))
        await conn.execute(text("ALTER TABLE tables ADD COLUMN IF NOT EXISTS time_format VARCHAR(10)"))
        await conn.execute(text("ALTER TABLE tables ADD COLUMN IF NOT EXISTS week_start_day VARCHAR(20)"))
        await conn.execute(text("ALTER TABLE tables ADD COLUMN IF NOT EXISTS work_hours VARCHAR(30)"))

    if settings.ENABLE_DEV_SEED_STAFF and settings.DEV_SEED_STAFF_PASSWORD:
        async with AsyncSession(engine) as session:
            res = await session.execute(select(User).where(User.login == settings.DEV_SEED_STAFF_LOGIN))
            staff = res.scalar_one_or_none()
            if not staff:
                session.add(
                    User(
                        first_name="Супер",
                        last_name="Работник",
                        login=settings.DEV_SEED_STAFF_LOGIN,
                        password_hash=hash_password(settings.DEV_SEED_STAFF_PASSWORD),
                        role="staff",
                        is_active=True,
                        position="Сотрудник",
                    ),
                )
                await session.commit()
    yield


app = FastAPI(
    title="SmartWork API",
    description="Заготовка API для дипломного проекта",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    system_router.router,
    prefix=f"{settings.API_V1_PREFIX}/system",
    tags=["system"],
)

app.include_router(
    auth_router.router,
    prefix=f"{settings.API_V1_PREFIX}/auth",
    tags=["auth"],
)

app.include_router(
    tables_router.router,
    prefix=f"{settings.API_V1_PREFIX}/tables",
    tags=["tables"],
)

app.include_router(
    table_workspace_router.router,
    prefix=f"{settings.API_V1_PREFIX}/tables",
    tags=["tables-workspace"],
)

app.include_router(
    settings_router.router,
    prefix=f"{settings.API_V1_PREFIX}/settings",
    tags=["settings"],
)

app.include_router(
    employees_router.router,
    prefix=f"{settings.API_V1_PREFIX}/employees",
    tags=["employees"],
)


@app.get("/health", tags=["system"])
async def health():
    return {
        "status": "ok",
        "message": "SmartWork API: окружение установлено, сервис готов.",
    }
