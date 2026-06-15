from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.db.base import Base
from app.db.session import engine
from app.core.config import settings
from app.routers import system as system_router
from app.routers import auth as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Создаём таблицы при старте (для прототипа).
    # В дальнейшем можно заменить на Alembic-миграции.
    import app.models  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Простая авто-миграция для прототипа, если таблица users уже существовала.
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE"))
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


@app.get("/health", tags=["system"])
async def health():
    return {
        "status": "ok",
        "message": "SmartWork API: окружение установлено, сервис готов.",
    }
