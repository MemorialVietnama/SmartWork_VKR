from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TableBonus(Base):
    __tablename__ = "table_bonuses"
    __table_args__ = (UniqueConstraint("table_id", "key", name="uq_table_bonus_table_key"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("tables.id"), index=True, nullable=False)
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
