from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.schemas.table import TableBonusDto, TableStatDto


class TableMemberBriefDto(BaseModel):
    user_id: int
    short_name: str
    is_owner: bool
    position: str | None = None
    role: str | None = None


class TablePatchRequest(BaseModel):
    """Предустановку стола (preset) менять нельзя — только при создании."""

    title: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=500)
    time_format: str | None = Field(default=None, max_length=10)
    week_start_day: str | None = Field(default=None, max_length=20)
    work_hours: str | None = Field(default=None, max_length=30)
    color: str | None = Field(default=None, max_length=20)
    order_enabled_directory_ids: list[int] | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> "TablePatchRequest":
        if not any(
            getattr(self, name) is not None
            for name in (
                "title",
                "description",
                "time_format",
                "week_start_day",
                "work_hours",
                "color",
                "order_enabled_directory_ids",
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
    order_enabled_directory_ids: list[int] = Field(default_factory=list)


class CalendarSlotDto(BaseModel):
    id: int
    title: str
    starts_at: datetime
    ends_at: datetime


class CalendarSlotCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    starts_at: datetime
    ends_at: datetime


class CalendarSlotPatchRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class ShiftScheduleApplyRequest(BaseModel):
    employee_user_id: int
    weekdays: list[int] = Field(default_factory=list)
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    weeks_ahead: int = Field(ge=1, le=8)


class ShiftScheduleApplyResponse(BaseModel):
    detail: str
    created_count: int
    skipped_duplicates: int


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
    payload: dict[str, Any] | None = None


class TableDirectoryDto(BaseModel):
    id: int
    name: str
    description: str | None = None
    schema_fields: list[dict[str, Any]] = Field(default_factory=list)
    kind: str | None = None
    items: list[DirectoryItemDto]


class TableDirectoryCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    schema_fields: list[dict[str, Any]] = Field(default_factory=list)


class DirectoryItemCreateRequest(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    value: str | None = Field(default=None, max_length=500)
    payload: dict[str, Any] | None = None


class DirectoryItemPatchRequest(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=200)
    value: str | None = Field(default=None, max_length=500)
    payload: dict[str, Any] | None = None


class PresetDirectoriesRepairResultDto(BaseModel):
    detail: str
    directories_created: int
    example_items_added: int
    skipped_nonempty_directories: int


class TemplateDirectoryStateDto(BaseModel):
    kind: str
    name: str
    enabled: bool
    connected: bool


class TemplateDirectoryToggleRequest(BaseModel):
    enabled: bool


class LegacyCustomDirectoriesCleanupDto(BaseModel):
    detail: str
    removed_directories: int
    removed_items: int


class TableOrderDto(BaseModel):
    id: int
    order_uuid: str
    order_number: str
    title: str
    starts_at: datetime
    ends_at: datetime
    client_directory_item_id: int | None = None
    assignee_user_id: int | None = None
    service_item_ids: list[int] = Field(default_factory=list)
    custom_directory_links: list[dict[str, Any]] = Field(default_factory=list)
    status: str
    price_base: float = 0.0
    price_adjustment: float = 0.0
    price_total: float = 0.0
    parent_order_id: int | None = None
    child_type: str | None = None
    metadata: dict[str, Any] | None = None
    created_at: datetime
    completed_at: datetime | None


class TableOrderCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    starts_at: datetime
    ends_at: datetime
    client_directory_item_id: int | None = None
    assignee_user_id: int | None = None
    service_item_ids: list[int] = Field(default_factory=list)
    custom_directory_links: list[dict[str, Any]] = Field(default_factory=list)
    price_adjustment: float = 0.0
    parent_order_id: int | None = None
    child_type: str | None = Field(default=None, pattern="^(follow_up|repeat_copy)$")
    metadata: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> "TableOrderCreateRequest":
        if self.ends_at <= self.starts_at:
            raise ValueError("Время окончания должно быть позже начала.")
        return self


class TableOrderUpdateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    status: str | None = Field(default=None, max_length=20)
    client_directory_item_id: int | None = None
    assignee_user_id: int | None = None
    service_item_ids: list[int] | None = None
    custom_directory_links: list[dict[str, Any]] | None = None
    price_adjustment: float | None = None
    metadata: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> "TableOrderUpdateRequest":
        if self.starts_at is not None and self.ends_at is not None and self.ends_at <= self.starts_at:
            raise ValueError("Время окончания должно быть позже начала.")
        return self


class TableOrderCreateChildRequest(BaseModel):
    child_type: str = Field(pattern="^(follow_up|repeat_copy)$")
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class TableOrderRescheduleRequest(BaseModel):
    starts_at: datetime
    ends_at: datetime
    reason: str | None = Field(default=None, max_length=500)
    keep_assignee: bool = True

    @model_validator(mode="after")
    def validate_dates(self) -> "TableOrderRescheduleRequest":
        if self.ends_at <= self.starts_at:
            raise ValueError("Время окончания должно быть позже начала.")
        return self


class OrderAvailabilityWarningDto(BaseModel):
    code: str
    message: str


class OrderAvailabilityCheckResponse(BaseModel):
    warnings: list[OrderAvailabilityWarningDto] = Field(default_factory=list)