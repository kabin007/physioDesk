"""Strongly typed application settings, loaded from environment variables (and `.env`)."""

from functools import cached_property, lru_cache
from typing import Annotated, Literal, Self
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# Substrings that mark a secret as a development placeholder. Such secrets are rejected in
# production so a copied `.env.example` can never end up signing real tokens.
_PLACEHOLDER_SECRET_MARKERS = ("change-me", "insecure", "example")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "PhysioDesk"
    app_env: Literal["development", "test", "production"] = "development"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # Required: there is deliberately no default, so a missing value fails at startup.
    database_url: str
    db_echo: bool = False

    jwt_secret_key: SecretStr = Field(min_length=32)
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    access_token_expire_minutes: int = Field(default=30, gt=0, le=24 * 60)
    refresh_token_expire_days: int = Field(default=7, gt=0, le=90)

    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    # All "today"/"this clinic day" logic is interpreted in this timezone.
    clinic_timezone: str = "Asia/Kathmandu"

    @field_validator("database_url")
    @classmethod
    def _require_async_driver(cls, value: str) -> str:
        if not value.startswith("postgresql+asyncpg://"):
            raise ValueError("DATABASE_URL must use the 'postgresql+asyncpg://' scheme")
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        # Accept a plain comma-separated string, which is friendlier in `.env` than JSON.
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("clinic_timezone")
    @classmethod
    def _validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"Unknown timezone: {value!r}") from exc
        return value

    @model_validator(mode="after")
    def _validate_production(self) -> Self:
        if self.app_env != "production":
            return self
        if self.debug:
            raise ValueError("DEBUG must be false in production")
        secret = self.jwt_secret_key.get_secret_value().lower()
        if any(marker in secret for marker in _PLACEHOLDER_SECRET_MARKERS):
            raise ValueError("JWT_SECRET_KEY is a development placeholder; set a real secret")
        return self

    @cached_property
    def clinic_tz(self) -> ZoneInfo:
        return ZoneInfo(self.clinic_timezone)


@lru_cache
def get_settings() -> Settings:
    # pydantic-settings populates the required fields from the environment.
    return Settings()
