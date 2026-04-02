from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.schemas.table import TableBonusDto, TableStatDto


class TableMemberBriefDto(BaseModel):
    user_id: int
    short_name: str
    is_owner: bool


class TablePatchRequest(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=500)
    preset: str | None = Field(default=None, max_length=50)
    custom_preset_name: str | None = Field(default=None, max_length=80)
    time_format: str | None = Field(default=None, max_length=10)
    week_start_day: str | None = Field(default=None, max_length=20)
    work_hours: str | None = Field(default=None, max_length=30)
    color: str | None = Field(default=None, max_length=20)

    @model_validator(mode="after")
    def at_least_one_field(self) -> "TablePatchRequest":
        if not any(
            getattr(self, name) is not None
            for name in (
                "title",
                "description",
                "preset",
                "custom_preset_name",
                "time_format",
                "week_start_day",
                "work_hours",
                "color",
            )
        ):
            raise ValueError("Укажите хотя бы одно поле для обновления.")
        return self


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


class DirectoryItemDto(BaseModel):
    id: int
    label: str
    value: str | None


class TableDirectoryDto(BaseModel):
    id: int
    name: str
    items: list[DirectoryItemDto]


class TableDirectoryCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class DirectoryItemCreateRequest(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    value: str | None = Field(default=None, max_length=500)


class TableOrderDto(BaseModel):
    id: int
    title: str
    status: str
    created_at: datetime
    completed_at: datetime | None


class TableOrderCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300)


class TableOrderUpdateRequest(BaseModel):
    status: str = Field(max_length=20)