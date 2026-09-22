"""Authentication: credential checks, token issuing/refresh and logout.

Logout semantics: every token carries the user's `token_version`. Logout increments it,
which immediately invalidates *all* of that user's access and refresh tokens (i.e. logout
everywhere). This gives real revocation without a token store, at the cost of one indexed
primary-key lookup per request, which `get_current_user` performs anyway to check
`is_active`.
"""

import logging
import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UserRole
from app.core.exceptions import InvalidCredentials, InvalidToken
from app.core.security import (
    TokenType,
    burn_password_check,
    create_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.models import User
from app.schemas.auth import TokenResponse

logger = logging.getLogger(__name__)


def normalize_identifier(value: str) -> str:
    return value.strip().lower()


async def authenticate(session: AsyncSession, identifier: str, password: str) -> User:
    """Return the active user matching the identifier (email or username) and password.

    Unknown users, wrong passwords and inactive accounts all produce the same error, so the
    endpoint does not reveal which accounts exist.
    """
    ident = normalize_identifier(identifier)
    user = await session.scalar(
        select(User).where(or_(User.email == ident, User.username == ident))
    )
    if user is None:
        burn_password_check(password)
        raise InvalidCredentials()

    is_valid, updated_hash = verify_password(password, user.hashed_password)
    if not is_valid or not user.is_active:
        raise InvalidCredentials()

    if updated_hash is not None:
        # Hash parameters were upgraded since this password was stored; re-hash transparently.
        user.hashed_password = updated_hash
        await session.commit()
    return user


def issue_tokens(user: User) -> TokenResponse:
    access = create_token(
        user_id=user.id,
        role=user.role,
        token_version=user.token_version,
        token_type=TokenType.ACCESS,
    )
    refresh = create_token(
        user_id=user.id,
        role=user.role,
        token_version=user.token_version,
        token_type=TokenType.REFRESH,
    )
    return TokenResponse(
        access_token=access.token,
        refresh_token=refresh.token,
        expires_in=access.expires_in,
        refresh_expires_in=refresh.expires_in,
    )


async def _load_token_user(session: AsyncSession, user_id: uuid.UUID, version: int) -> User:
    user = await session.get(User, user_id)
    # Deactivated users and revoked (logged-out) tokens are rejected immediately.
    if user is None or not user.is_active or user.token_version != version:
        raise InvalidToken()
    return user


async def user_from_access_token(session: AsyncSession, token: str) -> User:
    claims = decode_token(token, expected_type=TokenType.ACCESS)
    return await _load_token_user(session, claims.user_id, claims.token_version)


async def refresh_tokens(session: AsyncSession, refresh_token: str) -> TokenResponse:
    """Exchange a valid refresh token for a new access/refresh pair.

    The role is re-read from the database, so role changes take effect on refresh.
    """
    claims = decode_token(refresh_token, expected_type=TokenType.REFRESH)
    user = await _load_token_user(session, claims.user_id, claims.token_version)
    return issue_tokens(user)


async def logout(session: AsyncSession, user: User) -> None:
    user.token_version += 1
    await session.commit()
    logger.info("User %s logged out; all sessions revoked", user.id)


async def create_user(
    session: AsyncSession, *, email: str, username: str, password: str, role: UserRole
) -> User:
    """Create a user with a hashed password (used by the seed script and tests; there is no
    public sign-up endpoint)."""
    user = User(
        email=normalize_identifier(email),
        username=normalize_identifier(username),
        hashed_password=hash_password(password),
        role=role,
    )
    session.add(user)
    await session.commit()
    return user
