"""Strongly typed application settings, loaded from environment variables (and `.env`)."""

from functools import cached_property, lru_cache
from typing import Annotated, Literal, Self
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy.engine import make_url

# Substrings that mark a secret as a development placeholder. Such secrets are rejected in
# production so a copied `.env.example` can never end up signing real tokens.
_PLACEHOLDER_SECRET_MARKERS = ("change-me", "insecure", "example")

# Schemes managed providers hand out, all meaning "PostgreSQL over the default driver".
_SYNC_POSTGRES_SCHEMES = ("postgres", "postgresql")

# libpq connection parameters that asyncpg does not accept as keyword arguments. Managed
# providers put them in the connection strings they give you (Neon adds `channel_binding`),
# and passing them through would fail at connect time with an opaque TypeError.
_LIBPQ_ONLY_PARAMS = ("channel_binding", "sslrootcert", "sslcert", "sslkey", "sslnegotiation")


def _normalise_database_url(value: str) -> str:
    """Accept the connection string a hosted provider gives you, verbatim.

    Neon, Supabase and Render hand out libpq-flavoured URLs such as
    `postgresql://user:pw@host/db?sslmode=require&channel_binding=require`. This rewrites
    them into what asyncpg understands: the `postgresql+asyncpg` scheme, `sslmode` spelled
    as asyncpg's `ssl`, and libpq-only parameters dropped.
    """
    url = make_url(value)

    if url.drivername in _SYNC_POSTGRES_SCHEMES:
        url = url.set(drivername="postgresql+asyncpg")
    if url.drivername != "postgresql+asyncpg":
        raise ValueError(
            "DATABASE_URL must be a PostgreSQL URL "
            "(postgresql://…, postgres://… or postgresql+asyncpg://…), "
            f"got {url.drivername!r}"
        )

    query = {key: value for key, value in url.query.items() if key not in _LIBPQ_ONLY_PARAMS}
    sslmode = query.pop("sslmode", None)
    if sslmode is not None and "ssl" not in query:
        # asyncpg spells libpq's `sslmode` as `ssl`, accepting the same mode names.
        query["ssl"] = sslmode

    return url.set(query=query).render_as_string(hide_password=False)


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
    def _normalise_url(cls, value: str) -> str:
        return _normalise_database_url(value)

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
