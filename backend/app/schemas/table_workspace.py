from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.table import TableBonusDto, TableStatDto


class TableMemberBriefDto(BaseModel):
    user_id: int
    short_name: str
    is_owner: bool


class TableDetailDto(BaseModel):
    id: int
    title: str
    description: str | None
    preset: str | None
    custom_preset_name: str | None
    time_format: str | None
    week_start_day: str | None
    work_hours: str | None
    total_participants: int
    owner_short_name: str
    stats: TableStatDto
    can_edit_settings: bool
    bonuses: list[TableBonusDto] = Field(default_factory=list)


class CalendarSlotDto(BaseModel):
    id: int
    title: str
    starts_at: datetime
    ends_at: datetime


class CalendarSlotCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    starts_at: datetime
    ends_at: datetime


class TableTaskDto(BaseModel):
    id: int
    title: str
    status: str
    assignee_user_id: int | None


class TableTaskCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    status: str = Field(default="new", max_length=20)
    assignee_user_id: int | None = None


class TableTaskUpdateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    status: str | None = Field(default=None, max_length=20)
    assignee_user_id: int | None = None