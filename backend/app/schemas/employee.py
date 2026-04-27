from datetime import date, datetime

from pydantic import BaseModel, Field


class EmployeeCreateRequest(BaseModel):
    last_name: str = Field(min_length=1, max_length=100)
    first_name: str = Field(min_length=1, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    birth_date: date
    phone: str = Field(min_length=5, max_length=30)
    email: str | None = Field(default=None, max_length=255)
    position: str = Field(min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=500)


class EmployeeUpdateRequest(BaseModel):
    last_name: str = Field(min_length=1, max_length=100)
    first_name: str = Field(min_length=1, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    birth_date: date
    phone: str = Field(min_length=5, max_length=30)
    position: str = Field(min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=500)


class TempCredentialsDto(BaseModel):
    login: str
    password: str
    expires_at: datetime


class EmployeeDto(BaseModel):
    id: int
    last_name: str | None = None
    first_name: str | None = None
    middle_name: str | None = None
    birth_date: date | None = None
    phone: str | None = None
    email: str | None = None
    position: str | None = None
    note: str | None = None
    temp_credentials: TempCredentialsDto | None = None


class InviteCreateRequest(BaseModel):
    table_id: int


class InviteCreateResponse(BaseModel):
    code: str
    expires_at: datetime


class InviteAcceptRequest(BaseModel):
    code: str = Field(min_length=8, max_length=128)


class InviteInfoResponse(BaseModel):
    owner_short_name: str
    table_id: int | None = None
    table_title: str | None = None
    expires_at: datetime


class RegisterByInviteRequest(BaseModel):
    last_name: str = Field(min_length=1, max_length=100)
    first_name: str = Field(min_length=1, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    birth_date: date
    phone: str = Field(min_length=5, max_length=30)
    email: str = Field(min_length=5, max_length=255)
    avatar_data_url: str | None = Field(default=None, max_length=2000000)


class RegisterByInviteResponse(BaseModel):
    detail: str
    login: str
    owner_short_name: str


class EmployeeTableBindingDto(BaseModel):
    employee_id: int
    table_ids: list[int]


class EmployeeTableBindingUpdateRequest(BaseModel):
    table_ids: list[int] = Field(default_factory=list)


class DetachRequest(BaseModel):
    table_id: int
    reason: str = Field(min_length=5, max_length=1000)


class DetachRequestDto(BaseModel):
    id: int
    table_id: int
    table_title: str
    staff_user_id: int
    staff_short_name: str
    staff_login: str
    reason: str
    status: str
    created_at: datetime


class DetachRequestStatusDto(BaseModel):
    table_id: int
    request_id: int
    status_label: str
    is_read: bool
