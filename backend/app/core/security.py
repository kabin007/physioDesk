"""Password hashing (Argon2 via pwdlib) and JWT creation/validation."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from functools import lru_cache

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.core.config import get_settings
from app.core.enums import UserRole
from app.core.exceptions import InvalidToken
from app.utils.datetime import utc_now

_password_hash = PasswordHash((Argon2Hasher(),))


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, hashed: str) -> tuple[bool, str | None]:
    """Return (is_valid, new_hash). `new_hash` is set when the stored hash uses outdated
    parameters and should be replaced."""
    return _password_hash.verify_and_update(password, hashed)


@lru_cache
def _dummy_hash() -> str:
    return hash_password("dummy-password-for-timing-equalisation")


def burn_password_check(password: str) -> None:
    """Spend the same time as a real verification when the user does not exist, so response
    timing does not reveal which identifiers are registered."""
    _password_hash.verify(password, _dummy_hash())


class TokenType(StrEnum):
    ACCESS = "access"
    REFRESH = "refresh"


@dataclass(frozen=True, slots=True)
class TokenClaims:
    user_id: uuid.UUID
    role: UserRole
    token_type: TokenType
    token_version: int
    issued_at: datetime
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class IssuedToken:
    token: str
    expires_in: int  # seconds


def _lifetime(token_type: TokenType) -> timedelta:
    settings = get_settings()
    if token_type is TokenType.ACCESS:
        return timedelta(minutes=settings.access_token_expire_minutes)
    return timedelta(days=settings.refresh_token_expire_days)


def create_token(
    *, user_id: uuid.UUID, role: UserRole, token_version: int, token_type: TokenType
) -> IssuedToken:
    settings = get_settings()
    now = utc_now()
    lifetime = _lifetime(token_type)
    payload = {
        "sub": str(user_id),
        "role": role.value,
        "type": token_type.value,
        "ver": token_version,
        "iat": now,
        "exp": now + lifetime,
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(
        payload, settings.jwt_secret_key.get_secret_value(), algorithm=settings.jwt_algorithm
    )
    return IssuedToken(token=token, expires_in=int(lifetime.total_seconds()))


def decode_token(token: str, *, expected_type: TokenType) -> TokenClaims:
    """Validate signature, expiry and token type. Raises `InvalidToken` on any failure."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "role", "type", "ver", "iat", "exp"]},
        )
        claims = TokenClaims(
            user_id=uuid.UUID(payload["sub"]),
            role=UserRole(payload["role"]),
            token_type=TokenType(payload["type"]),
            token_version=int(payload["ver"]),
            issued_at=datetime.fromtimestamp(payload["iat"], tz=UTC),
            expires_at=datetime.fromtimestamp(payload["exp"], tz=UTC),
        )
    except (jwt.PyJWTError, ValueError, KeyError, TypeError) as exc:
        raise InvalidToken() from exc

    # An access token must never be usable as a refresh token and vice versa.
    if claims.token_type is not expected_type:
        raise InvalidToken(f"Expected a token of type {expected_type.value!r}.")
    return claims
