from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterCodeRequest(BaseModel):
    first_name: str = Field(min_length=2, max_length=100)
    last_name: str = Field(min_length=2, max_length=100)
    login: EmailStr
    password: str = Field(min_length=8, max_length=128)
    password_confirm: str = Field(min_length=8, max_length=128)
    role: Literal["owner", "staff"]


class RegisterConfirmRequest(BaseModel):
    login: EmailStr
    code: str = Field(min_length=4, max_length=12)


class ResendCodeRequest(BaseModel):
    login: EmailStr


class LoginRequest(BaseModel):
    login: EmailStr
    password: str = Field(min_length=8, max_length=128)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    login: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=256)
    new_password: str = Field(min_length=8, max_length=128)


class MeResponse(BaseModel):
    id: int
    first_name: str | None = None
    last_name: str | None = None
    login: EmailStr
    role: str

