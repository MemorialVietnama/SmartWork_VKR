from __future__ import annotations

import re
import secrets
import json
import time
from datetime import timedelta
from pathlib import Path
from typing import Annotated

import redis.asyncio as redis
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.db.session import get_db
from app.models.table_member import TableMember
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MeResponse,
    RefreshTokenRequest,
    RegisterCodeRequest,
    RegisterConfirmRequest,
    ResendCodeRequest,
    ResetPasswordRequest,
)
from app.services.email_sender import send_email

router = APIRouter()

CODE_SEND_COOLDOWN_SECONDS = 60
CODE_MAX_SENDS_PER_HOUR = 5
CODE_MAX_VERIFY_ATTEMPTS = 5
CODE_LOCK_SECONDS = 5 * 60


def _debug_log(message: str, data: dict, hypothesis_id: str, run_id: str = "run1") -> None:
    payload = {
        "sessionId": "f3eb11",
        "runId": run_id,
        "hypothesisId": hypothesis_id,
        "location": "backend/app/routers/auth.py",
        "message": message,
        "data": data,
        "timestamp": int(time.time() * 1000),
    }
    Path("debug-f3eb11.log").open("a", encoding="utf-8").write(json.dumps(payload, ensure_ascii=False) + "\n")


def _build_auth_response(user_id: int) -> AuthResponse:
    access_token = create_access_token(
        subject=user_id,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_refresh_token(
        subject=user_id,
        expires_delta=timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES),
    )
    return AuthResponse(access_token=access_token, refresh_token=refresh_token)


def _normalize_login(login: str) -> str:
    return login.strip().lower()


def _validate_password_rules(password: str) -> None:
    """
    Минимальные правила сложности:
    - минимум 8 символов
    - минимум 1 заглавная, 1 строчная, 1 цифра, 1 спецсимвол
    """
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail="Password must contain an uppercase letter")
    if not re.search(r"[a-z]", password):
        raise HTTPException(status_code=400, detail="Password must contain a lowercase letter")
    if not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="Password must contain a digit")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise HTTPException(status_code=400, detail="Password must contain a special character")


async def _send_registration_code(user: User) -> None:
    login = _normalize_login(user.login)
    code = f"{secrets.randbelow(1000000):06d}"
    code_key = f"reg_code:{login}"
    attempts_key = f"reg_attempts:{login}"
    cooldown_key = f"reg_cooldown:{login}"
    hourly_key = f"reg_hour_count:{login}"

    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        if await r.exists(cooldown_key):
            raise HTTPException(
                status_code=429,
                detail=f"Code can be resent only every {CODE_SEND_COOLDOWN_SECONDS} seconds",
            )

        hour_count = await r.incr(hourly_key)
        if hour_count == 1:
            await r.expire(hourly_key, 3600)
        if hour_count > CODE_MAX_SENDS_PER_HOUR:
            raise HTTPException(status_code=429, detail="Too many code requests, try again later")

        ttl = int(timedelta(minutes=settings.REGISTRATION_CODE_EXPIRE_MINUTES).total_seconds())
        await r.setex(code_key, ttl, code)
        await r.delete(attempts_key)
        await r.setex(cooldown_key, CODE_SEND_COOLDOWN_SECONDS, "1")
    finally:
        await r.aclose()

    body = (
        "Здравствуйте!\n\n"
        "Код подтверждения регистрации SmartWork:\n"
        f"{code}\n\n"
        f"Срок действия: {settings.REGISTRATION_CODE_EXPIRE_MINUTES} минут.\n"
        "Если это были не вы — проигнорируйте письмо."
    )
    try:
        await send_email(
            to_email=login,
            subject="SmartWork: код подтверждения",
            body_text=body,
        )
    except Exception:
        # В прототипе не валим ответ при временной проблеме SMTP.
        pass


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    token = authorization.split(" ", 1)[1].strip()
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if payload.get("type") not in (None, "access"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    try:
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


@router.post("/register/request-code")
async def register_request_code(req: RegisterCodeRequest, db: AsyncSession = Depends(get_db)) -> dict:
    login = _normalize_login(req.login)
    # region agent log
    _debug_log(
        "register_request_code_entry",
        {"login_domain": login.split("@")[-1] if "@" in login else "invalid"},
        "H3",
    )
    # endregion
    if req.password != req.password_confirm:
        raise HTTPException(status_code=400, detail="Password confirmation does not match")
    _validate_password_rules(req.password)

    try:
        res = await db.execute(select(User).where(User.login == login))
    except Exception as exc:
        # region agent log
        _debug_log(
            "register_request_code_select_failed",
            {"error_type": type(exc).__name__, "error": str(exc)[:300]},
            "H4",
        )
        # endregion
        raise
    existing = res.scalar_one_or_none()
    # region agent log
    _debug_log(
        "register_request_code_select_ok",
        {"existing_user_found": existing is not None},
        "H4",
    )
    # endregion

    if existing and existing.is_active:
        raise HTTPException(status_code=409, detail="User already exists")

    if existing is None:
        user = User(
            first_name=req.first_name.strip(),
            last_name=req.last_name.strip(),
            login=login,
            password_hash=hash_password(req.password),
            role=req.role,
            is_active=False,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        existing.first_name = req.first_name.strip()
        existing.last_name = req.last_name.strip()
        existing.password_hash = hash_password(req.password)
        existing.role = req.role
        existing.is_active = False
        db.add(existing)
        await db.commit()
        await db.refresh(existing)
        user = existing

    await _send_registration_code(user)
    return {"detail": "Код подтверждения отправлен на email."}


@router.post("/register/resend-code")
async def register_resend_code(req: ResendCodeRequest, db: AsyncSession = Depends(get_db)) -> dict:
    login = _normalize_login(req.login)
    res = await db.execute(select(User).where(User.login == login))
    user = res.scalar_one_or_none()
    if not user or user.is_active:
        raise HTTPException(status_code=404, detail="Registration session not found")

    await _send_registration_code(user)
    return {"detail": "Новый код подтверждения отправлен."}


@router.post("/register/confirm", response_model=AuthResponse)
async def register_confirm(req: RegisterConfirmRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    login = _normalize_login(req.login)
    res = await db.execute(select(User).where(User.login == login))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Registration session not found")
    if user.is_active:
        raise HTTPException(status_code=409, detail="Account is already activated")

    code_key = f"reg_code:{login}"
    attempts_key = f"reg_attempts:{login}"
    lock_key = f"reg_lock:{login}"

    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        if await r.exists(lock_key):
            raise HTTPException(status_code=429, detail="Too many invalid attempts. Try later.")

        code_saved = await r.get(code_key)
        if not code_saved:
            raise HTTPException(status_code=400, detail="Code expired. Request a new code.")

        if code_saved != req.code.strip():
            attempts = await r.incr(attempts_key)
            if attempts == 1:
                await r.expire(attempts_key, 3600)
            if attempts >= CODE_MAX_VERIFY_ATTEMPTS:
                await r.setex(lock_key, CODE_LOCK_SECONDS, "1")
            raise HTTPException(status_code=400, detail="Invalid confirmation code")

        await r.delete(code_key)
        await r.delete(attempts_key)
        await r.delete(lock_key)
    finally:
        await r.aclose()

    user.is_active = True

    # Если регистрация шла по invite-ссылке, привязываем к владельцу и столу.
    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        bind_raw = await r.get(f"invite_bind:{login}")
        if bind_raw:
            import json

            bind = json.loads(bind_raw)
            owner_id = int(bind.get("owner_id"))
            table_id = int(bind.get("table_id"))
            if user.owner_id is None:
                user.owner_id = owner_id
            member_res = await db.execute(
                select(TableMember).where(TableMember.table_id == table_id, TableMember.user_id == user.id),
            )
            if not member_res.scalar_one_or_none():
                db.add(TableMember(table_id=table_id, user_id=user.id))
            await r.delete(f"invite_bind:{login}")
    finally:
        await r.aclose()

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return _build_auth_response(user.id)


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    login = _normalize_login(req.login)
    res = await db.execute(select(User).where(User.login == login))
    user = res.scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid login or password")

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCOUNT_NOT_ACTIVATED", "login": login},
        )

    return _build_auth_response(user.id)


@router.post("/refresh", response_model=AuthResponse)
async def refresh_tokens(req: RefreshTokenRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    payload = decode_token(req.refresh_token.strip())
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    try:
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    return _build_auth_response(user.id)


@router.get("/me", response_model=MeResponse)
async def me(user: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        login=user.login,
        role=user.role,
    )


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)) -> dict:
    # Не раскрываем существование аккаунта (защита от перебора).
    login = _normalize_login(req.login)
    res = await db.execute(select(User).where(User.login == login))
    user = res.scalar_one_or_none()

    if user:
        token = secrets.token_urlsafe(32)
        reset_key = f"pw_reset:{token}"
        r = redis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            expire_seconds = int(timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES).total_seconds())
            await r.setex(reset_key, expire_seconds, str(user.id))
        finally:
            await r.aclose()

        reset_link = f"{settings.FRONTEND_BASE_URL}/reset-password?token={token}"
        body = (
            "Здравствуйте!\n\n"
            f"Вы запросили сброс пароля для аккаунта {user.login}.\n\n"
            f"Перейдите по ссылке для установки нового пароля:\n{reset_link}\n\n"
            "Если это были не вы — просто проигнорируйте письмо."
        )
        try:
            await send_email(
                to_email=user.login,
                subject="SmartWork: сброс пароля",
                body_text=body,
            )
        except Exception:
            pass

    return {"detail": "Если аккаунт существует, мы отправили письмо с инструкциями."}


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)) -> dict:
    _validate_password_rules(req.new_password)

    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        reset_key = f"pw_reset:{req.token}"
        user_id_raw = await r.get(reset_key)
        if not user_id_raw:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

        user_id = int(user_id_raw)
        await r.delete(reset_key)
    finally:
        await r.aclose()

    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")

    user.password_hash = hash_password(req.new_password)
    db.add(user)
    await db.commit()

    return {"detail": "Пароль успешно изменен."}


@router.get("/oauth/{provider}", response_model=AuthResponse)
async def oauth_demo(provider: str, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    provider_norm = provider.lower()
    login = f"{provider_norm}_user@demo.smartwork.local"

    res = await db.execute(select(User).where(User.login == login))
    user = res.scalar_one_or_none()
    if not user:
        user = User(
            first_name=provider_norm.upper(),
            last_name="User",
            login=login,
            password_hash=hash_password(secrets.token_urlsafe(24)),
            role="staff",
            provider=provider_norm,
            provider_user_id=secrets.token_urlsafe(12),
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return _build_auth_response(user.id)

