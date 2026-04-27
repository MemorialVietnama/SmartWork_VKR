from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Float, ForeignKey, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TableOrder(Base):
    __tablename__ = "table_orders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("tables.id"), index=True, nullable=False)
    order_uuid: Mapped[str] = mapped_column(String(36), nullable=False, default=lambda: str(uuid4()), index=True)
    order_number: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    client_directory_item_id: Mapped[int | None] = mapped_column(ForeignKey("table_directory_items.id"), nullable=True, index=True)
    assignee_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    service_item_ids: Mapped[list[int] | None] = mapped_column(JSON, nullable=True)
    custom_directory_links: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued")
    price_base: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    price_adjustment: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    price_total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    parent_order_id: Mapped[int | None] = mapped_column(ForeignKey("table_orders.id"), nullable=True, index=True)
    child_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
