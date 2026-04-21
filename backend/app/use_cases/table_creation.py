from __future__ import annotations

import secrets

import redis.asyncio as redis
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.directory_presets import normalize_table_preset
from app.core.config import settings
from app.models.table import Table
from app.models.table_bonus import TableBonus
from app.models.table_member import TableMember
from app.models.user import User
from app.schemas.table import TableCreateRequest, TableDto, TableStatDto
from app.services.directory_bootstrap import bootstrap_preset_directories
from app.services.email_sender import send_email


class TableCreationUseCase:
    def __init__(self, create_code_ttl_seconds: int = 10 * 60) -> None:
        self.create_code_ttl_seconds = create_code_ttl_seconds

    async def request_create_code(self, req: TableCreateRequest, current_user: User) -> dict:
        self._ensure_owner(current_user)
        code = f"{secrets.randbelow(1000000):06d}"
        r = redis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            await r.setex(f"table_create_code:{current_user.id}", self.create_code_ttl_seconds, code)
            await r.setex(
                f"table_create_payload:{current_user.id}",
                self.create_code_ttl_seconds,
                req.model_dump_json(),
            )
        finally:
            await r.aclose()

        try:
            await send_email(
                to_email=current_user.login,
                subject="SmartWork: подтверждение создания стола",
                body_text=(
                    "Код подтверждения создания стола:\n"
                    f"{code}\n\n"
                    "Код действует 10 минут."
                ),
            )
        except Exception:
            pass
        return {"detail": "Код подтверждения отправлен на email."}

    async def confirm_create(self, code: str, db: AsyncSession, current_user: User) -> TableDto:
        self._ensure_owner(current_user)
        r = redis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            saved_code = await r.get(f"table_create_code:{current_user.id}")
            payload_raw = await r.get(f"table_create_payload:{current_user.id}")
            if not saved_code or not payload_raw:
                raise HTTPException(status_code=400, detail="Код истек. Запросите новый.")
            if saved_code != code.strip():
                raise HTTPException(status_code=400, detail="Неверный код подтверждения.")
            await r.delete(f"table_create_code:{current_user.id}")
            await r.delete(f"table_create_payload:{current_user.id}")
        finally:
            await r.aclose()
        payload = TableCreateRequest.model_validate_json(payload_raw)
        return await self._create_table_from_payload(db=db, current_user=current_user, req=payload)

    def _ensure_owner(self, current_user: User) -> None:
        if current_user.role != "owner":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can create table")

    async def _create_table_from_payload(self, db: AsyncSession, current_user: User, req: TableCreateRequest) -> TableDto:
        participants_count = 1
        table = Table(
            title=req.title.strip(),
            description=req.description.strip() if req.description else None,
            color=None,
            preset=normalize_table_preset(req.preset.strip()),
            custom_preset_name=req.custom_preset_name.strip() if req.custom_preset_name else None,
            time_format=req.time_format.strip(),
            week_start_day=req.week_start_day.strip(),
            work_hours=req.work_hours.strip(),
            owner_id=current_user.id,
        )
        db.add(table)
        await db.commit()
        await db.refresh(table)

        for bonus_key in req.bonus_keys:
            db.add(TableBonus(table_id=table.id, key=bonus_key, qty=1))

        if req.selected_employee_ids:
            res = await db.execute(
                select(User.id).where(User.id.in_(req.selected_employee_ids), User.owner_id == current_user.id),
            )
            allowed_ids = [item[0] for item in res.all()]
            participants_count += len(allowed_ids)
            for employee_id in allowed_ids:
                db.add(TableMember(table_id=table.id, user_id=employee_id))
        await db.commit()
        await bootstrap_preset_directories(db, table.id, req.preset)
        return TableDto(
            id=table.id,
            title=table.title,
            description=table.description,
            color=table.color,
            total_participants=participants_count,
            owner_short_name=self._owner_short_name(current_user),
            stats=TableStatDto(),
        )

    def _owner_short_name(self, user: User) -> str:
        last_name = (user.last_name or "").strip()
        first_name = (user.first_name or "").strip()
        if not last_name and not first_name:
            return user.login
        first_initial = f"{first_name[0]}." if first_name else ""
        return f"{last_name} {first_initial}".strip()
