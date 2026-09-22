import uuid
from datetime import datetime

from pydantic import Field

from app.core.enums import UserRole
from app.schemas.common import APIModel, ORMModel


class LoginRequest(APIModel):
    identifier: str = Field(
        min_length=1,
        max_length=255,
        description="Email address or username (case-insensitive).",
        examples=["admin@physiodesk.local"],
    )
    # No strength rules on login: they belong to password creation, not verification.
    password: str = Field(min_length=1, max_length=128, examples=["Admin123!"])


class RefreshRequest(APIModel):
    refresh_token: str = Field(min_length=1)


class TokenResponse(APIModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Access token lifetime in seconds.")
    refresh_expires_in: int = Field(description="Refresh token lifetime in seconds.")


class UserRead(ORMModel):
    id: uuid.UUID
    # Plain str on output: stored values were validated on the way in, and strict validators
    # reject reserved dev domains such as `.local`.
    email: str
    username: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime
