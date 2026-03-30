from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


def verify_password(plain: str, hashed: str) -> bool:
    """
    Проверка пароля через bcrypt.
    В БД храним hash как строку, bcrypt ожидает bytes.
    """

    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def hash_password(password: str) -> str:
    """
    Хэширование пароля через bcrypt.
    """

    pw = password.encode("utf-8")[:72]  # bcrypt ограничивает длину входа
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pw, salt)
    return hashed.decode("utf-8")


def create_access_token(
    subject: str | Any,
    expires_delta: timedelta | None = None,
) -> str:
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode = {"exp": expire, "sub": str(subject)}
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None

