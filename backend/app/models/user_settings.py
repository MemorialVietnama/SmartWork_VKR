from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True, nullable=False)

    appearance_theme: Mapped[str] = mapped_column(String(20), default="auto")
    appearance_density: Mapped[str] = mapped_column(String(20), default="comfortable")
    appearance_card_size: Mapped[str] = mapped_column(String(20), default="medium")

    notif_source_system: Mapped[bool] = mapped_column(Boolean, default=True)
    notif_source_tables: Mapped[bool] = mapped_column(Boolean, default=True)
    notif_source_employees: Mapped[bool] = mapped_column(Boolean, default=True)

    notif_to_desktop: Mapped[bool] = mapped_column(Boolean, default=True)
    notif_to_mobile: Mapped[bool] = mapped_column(Boolean, default=True)
    notif_to_email: Mapped[bool] = mapped_column(Boolean, default=False)

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

