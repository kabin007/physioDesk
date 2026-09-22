"""Reusable FastAPI dependencies: DB session, authentication, authorisation, pagination."""

from typing import Annotated

from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UserRole
from app.core.exceptions import AuthenticationError, PermissionDenied
from app.db.models import User
from app.db.session import get_db_session
from app.schemas.common import PageParams
from app.services import auth as auth_service

DbSession = Annotated[AsyncSession, Depends(get_db_session)]

# auto_error=False so a missing header produces our consistent 401 body, not FastAPI's 403.
_bearer = HTTPBearer(auto_error=False, description="Access token from POST /auth/login")


async def get_current_user(
    session: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthenticationError()
    return await auth_service.user_from_access_token(session, credentials.credentials)


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_admin(user: CurrentUser) -> User:
    if user.role is not UserRole.ADMIN:
        raise PermissionDenied("This action requires the ADMIN role.")
    return user


AdminUser = Annotated[User, Depends(require_admin)]


def get_page_params(
    page: Annotated[int, Query(ge=1, description="1-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Items per page.")] = 20,
) -> PageParams:
    return PageParams(page=page, page_size=page_size)


Pagination = Annotated[PageParams, Depends(get_page_params)]
