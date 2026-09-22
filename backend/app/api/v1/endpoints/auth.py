from fastapi import APIRouter, status

from app.api.dependencies import CurrentUser, DbSession
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse, UserRead
from app.schemas.common import error_responses
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["Authentication"])

_UNAUTHORIZED = error_responses(status.HTTP_401_UNAUTHORIZED)


@router.post(
    "/login",
    summary="Log in with email or username",
    description="Returns an access token (for the `Authorization: Bearer` header) and a "
    "longer-lived refresh token. The identifier may be an email address or a username.",
    responses=_UNAUTHORIZED,
)
async def login(body: LoginRequest, session: DbSession) -> TokenResponse:
    user = await auth_service.authenticate(session, body.identifier, body.password)
    return auth_service.issue_tokens(user)


@router.post(
    "/refresh",
    summary="Exchange a refresh token for a new token pair",
    description="Only refresh tokens are accepted here; access tokens are rejected.",
    responses=_UNAUTHORIZED,
)
async def refresh(body: RefreshRequest, session: DbSession) -> TokenResponse:
    return await auth_service.refresh_tokens(session, body.refresh_token)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Log out (revokes all of the user's tokens)",
    description="Invalidates every access and refresh token previously issued to the current "
    "user, on all devices.",
    responses=_UNAUTHORIZED,
)
async def logout(user: CurrentUser, session: DbSession) -> None:
    await auth_service.logout(session, user)


@router.get(
    "/me",
    summary="Current user profile",
    responses=_UNAUTHORIZED,
)
async def me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)
