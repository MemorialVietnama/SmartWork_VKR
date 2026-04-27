from datetime import datetime

from pydantic import BaseModel, Field


class NotificationDto(BaseModel):
    id: int
    kind: str
    title: str
    message: str
    priority: str
    is_read: bool
    payload: dict | None = None
    created_at: datetime
    read_at: datetime | None = None


class NotificationsListResponse(BaseModel):
    items: list[NotificationDto]
    unread_count: int


class NotificationReadRequest(BaseModel):
    ids: list[int] = Field(default_factory=list)
