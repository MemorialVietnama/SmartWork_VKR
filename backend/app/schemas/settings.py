from pydantic import BaseModel, EmailStr


class SecuritySettingsDto(BaseModel):
    email_masked: str
    password_masked: str = "********"


class NotificationSourcesDto(BaseModel):
    system: bool = True
    tables: bool = True
    employees: bool = True


class NotificationTargetsDto(BaseModel):
    desktop: bool = True
    mobile: bool = True
    email: bool = False


class NotificationSettingsDto(BaseModel):
    sources: NotificationSourcesDto
    targets: NotificationTargetsDto


class AppearanceSettingsDto(BaseModel):
    theme: str = "auto"
    density: str = "comfortable"
    card_size: str = "medium"


class AccountSettingsDto(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    login: EmailStr
    security: SecuritySettingsDto


class UserSettingsDto(BaseModel):
    account: AccountSettingsDto
    appearance: AppearanceSettingsDto
    notifications: NotificationSettingsDto


class UserSettingsUpdateRequest(BaseModel):
    appearance: AppearanceSettingsDto
    notifications: NotificationSettingsDto

