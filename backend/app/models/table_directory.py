from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TableDirectory(Base):
    __tablename__ = "table_directories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("tables.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    items: Mapped[list["TableDirectoryItem"]] = relationship(
        "TableDirectoryItem",
        back_populates="directory",
        cascade="all, delete-orphan",
    )


class TableDirectoryItem(Base):
    __tablename__ = "table_directory_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    directory_id: Mapped[int] = mapped_column(
        ForeignKey("table_directories.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    value: Mapped[str | None] = mapped_column(String(500), nullable=True)

    directory: Mapped[TableDirectory] = relationship("TableDirectory", back_populates="items")
