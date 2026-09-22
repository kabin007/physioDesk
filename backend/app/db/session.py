"""Async engine and session factory.

Transaction boundaries: one `AsyncSession` per request (see `get_db_session`). Each public,
mutating service function is a single unit of work: it flushes to surface constraint
violations as domain errors and commits exactly once at the end. Helpers never commit.
"""

from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings


@lru_cache
def get_engine() -> AsyncEngine:
    settings = get_settings()
    if settings.app_env == "test":
        # Tests open short-lived connections across fixtures; pooling adds nothing there.
        return create_async_engine(settings.database_url, echo=settings.db_echo, poolclass=NullPool)
    return create_async_engine(settings.database_url, echo=settings.db_echo, pool_pre_ping=True)


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    # expire_on_commit=False: objects stay readable after commit without lazy IO, which
    # would otherwise fail under asyncio when serialising the response.
    return async_sessionmaker(get_engine(), expire_on_commit=False, autoflush=False)


async def get_db_session() -> AsyncIterator[AsyncSession]:
    # Closing the session rolls back anything left uncommitted (e.g. after an error).
    async with get_sessionmaker()() as session:
        yield session
