from pydantic import BaseModel, Field


class TableCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=500)
    preset: str = Field(min_length=2, max_length=50)
    custom_preset_name: str | None = Field(default=None, max_length=80)
    selected_employee_ids: list[int] = Field(default_factory=list)
    bonus_keys: list[str] = Field(default_factory=list)
    time_format: str = Field(default="us", max_length=10)
    week_start_day: str = Field(default="monday", max_length=20)
    work_hours: str = Field(default="09:00-18:00", max_length=30)


class TableCreateConfirmRequest(BaseModel):
    code: str = Field(min_length=4, max_length=12)


class TableDeleteConfirmRequest(BaseModel):
    code: str = Field(min_length=4, max_length=12)


class TableStatDto(BaseModel):
    active_employees: int = 0
    queued_orders: int = 0
    tasks_done: int = 0
    tasks_waiting: int = 0
    tasks_new: int = 0


class TableDto(BaseModel):
    id: int
    title: str
    description: str | None = None
    color: str | None = None
    total_participants: int
    owner_short_name: str
    stats: TableStatDto


class AnalyticsMiniChartDto(BaseModel):
    title: str
    subtitle: str
    values: list[int]


class AnalyticsKpiDto(BaseModel):
    key: str
    title: str
    value: float
    unit: str | None = None
    delta_percent: float | None = None


class AnalyticsPeriodPointDto(BaseModel):
    period: str
    values: list[int]


class AnalyticsSegmentDto(BaseModel):
    key: str
    label: str
    value: float


class AnalyticsForecastDto(BaseModel):
    horizon: str
    values: list[int]


class AnalyticsAnomalyDto(BaseModel):
    date: str
    title: str
    severity: str


class AnalyticsBreakdownRowDto(BaseModel):
    label: str
    value: float


class TableAnalyticsDto(BaseModel):
    table_id: int
    table_name: str
    participants: int
    active_employees: int
    queued_orders: int
    charts: list[AnalyticsMiniChartDto]
    kpis: list[AnalyticsKpiDto] = Field(default_factory=list)
    periods: list[AnalyticsPeriodPointDto] = Field(default_factory=list)
    segments: list[AnalyticsSegmentDto] = Field(default_factory=list)
    forecast: AnalyticsForecastDto | None = None
    anomalies: list[AnalyticsAnomalyDto] = Field(default_factory=list)
    breakdown: list[AnalyticsBreakdownRowDto] = Field(default_factory=list)


class TableBonusDto(BaseModel):
    key: str
    qty: int


class TableSubscriptionDto(BaseModel):
    table_id: int
    bonuses: list[TableBonusDto]


class TableSubscriptionUpdateRequest(BaseModel):
    bonuses: list[TableBonusDto] = Field(default_factory=list)


class TableMemberAddRequest(BaseModel):
    employee_id: int
