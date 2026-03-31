from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.models.user_settings import UserSettings
from app.routers.auth import get_current_user
from app.schemas.settings import (
    AccountSettingsDto,
    AppearanceSettingsDto,
    NotificationSettingsDto,
    NotificationSourcesDto,
    NotificationTargetsDto,
    SecuritySettingsDto,
    UserSettingsDto,
    UserSettingsUpdateRequest,
)

router = APIRouter()


def _mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if not local:
        return f"***@{domain}" if domain else "***"
    if len(local) == 1:
        return f"{local}***@{domain}"
    return f"{local[0]}***{local[-1]}@{domain}"


async def _get_or_create_user_settings(db: AsyncSession, user_id: int) -> UserSettings:
    res = await db.execute(select(UserSettings).where(UserSettings.user_id == user_id))
    settings = res.scalar_one_or_none()
    if settings:
        return settings

    settings = UserSettings(user_id=user_id)
    db.add(settings)
    await db.commit()
    await db.refresh(settings)
    return settings


def _to_dto(user: User, settings: UserSettings) -> UserSettingsDto:
    return UserSettingsDto(
        account=AccountSettingsDto(
            first_name=user.first_name,
            last_name=user.last_name,
            login=user.login,
            security=SecuritySettingsDto(email_masked=_mask_email(user.login)),
        ),
        appearance=AppearanceSettingsDto(
            theme=settings.appearance_theme,
            density=settings.appearance_density,
            card_size=settings.appearance_card_size,
        ),
        notifications=NotificationSettingsDto(
            sources=NotificationSourcesDto(
                system=settings.notif_source_system,
                tables=settings.notif_source_tables,
                employees=settings.notif_source_employees,
            ),
            targets=NotificationTargetsDto(
                desktop=settings.notif_to_desktop,
                mobile=settings.notif_to_mobile,
                email=settings.notif_to_email,
            ),
        ),
    )


@router.get("/me", response_model=UserSettingsDto)
async def my_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserSettingsDto:
    settings = await _get_or_create_user_settings(db, current_user.id)
    return _to_dto(current_user, settings)


@router.put("/me", response_model=UserSettingsDto)
async def update_my_settings(
    req: UserSettingsUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserSettingsDto:
    settings = await _get_or_create_user_settings(db, current_user.id)

    settings.appearance_theme = req.appearance.theme
    settings.appearance_density = req.appearance.density
    settings.appearance_card_size = req.appearance.card_size

    settings.notif_source_system = req.notifications.sources.system
    settings.notif_source_tables = req.notifications.sources.tables
    settings.notif_source_employees = req.notifications.sources.employees

    settings.notif_to_desktop = req.notifications.targets.desktop
    settings.notif_to_mobile = req.notifications.targets.mobile
    settings.notif_to_email = req.notifications.targets.email

    db.add(settings)
    await db.commit()
    await db.refresh(settings)

    return _to_dto(current_user, settings)

