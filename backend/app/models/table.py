from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Table(Base):
    __tablename__ = "tables"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    preset: Mapped[str | None] = mapped_column(String(50), nullable=True)
    custom_preset_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    time_format: Mapped[str | None] = mapped_column(String(10), nullable=True)
    week_start_day: Mapped[str | None] = mapped_column(String(20), nullable=True)
    work_hours: Mapped[str | None] = mapped_column(String(30), nullable=True)

    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
