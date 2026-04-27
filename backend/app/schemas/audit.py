from datetime import datetime

from pydantic import BaseModel


class AuditEventDto(BaseModel):
    id: int
    actor_user_id: int | None = None
    actor_role: str | None = None
    owner_id: int | None = None
    action: str
    entity_type: str
    entity_id: str | None = None
    status: str
    metadata: dict | None = None
    created_at: datetime
