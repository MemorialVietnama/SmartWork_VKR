from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = "postgresql+asyncpg://smartwork:smartwork_secret@localhost:5432/smartwork"
    REDIS_URL: str = "redis://localhost:6379/0"
    SMTP_HOST: str = "mail"
    SMTP_PORT: int = 1025
    EMAIL_FROM: str = "SmartWork <no-reply@smartwork.local>"
    JWT_SECRET_KEY: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    RESET_TOKEN_EXPIRE_MINUTES: int = 30
    REGISTRATION_CODE_EXPIRE_MINUTES: int = 15
    CORS_ORIGINS: str = "http://localhost:4200,http://127.0.0.1:4200"
    API_V1_PREFIX: str = "/api/v1"
    FRONTEND_BASE_URL: str = "http://localhost"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
