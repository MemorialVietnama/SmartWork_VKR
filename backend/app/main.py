import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import configure_logging
from app.core.security import hash_password
from app.db.session import engine
from app.models.user import User
from app.routers import system as system_router
from app.routers import auth as auth_router
from app.routers import tables as tables_router
from app.routers import settings as settings_router
from app.routers import employees as employees_router
from app.routers import table_workspace as table_workspace_router

configure_logging()
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import app.models  # noqa: F401
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


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    start = time.perf_counter()
    response = None
    try:
        response = await call_next(request)
        return response
    finally:
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        client_ip = request.client.host if request.client else None
        status_code = response.status_code if response is not None else 500
        logger.info(
            "http_request",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": status_code,
                "duration_ms": duration_ms,
                "client_ip": client_ip,
            },
        )
        if response is not None:
            response.headers["x-request-id"] = request_id


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    logger.warning(
        "validation_error",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": 422,
            "client_ip": request.client.host if request.client else None,
        },
        exc_info=exc,
    )
    return JSONResponse(status_code=422, content={"detail": exc.errors(), "request_id": request_id})


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    logger.warning(
        "http_error",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": exc.status_code,
            "client_ip": request.client.host if request.client else None,
        },
    )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail, "request_id": request_id})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    logger.exception(
        "unhandled_error",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": 500,
            "client_ip": request.client.host if request.client else None,
        },
    )
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error", "request_id": request_id})

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
