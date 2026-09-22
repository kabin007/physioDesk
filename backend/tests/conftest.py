"""Test infrastructure.

Tests run against a dedicated PostgreSQL database (never the developer's): TEST_DATABASE_URL,
or DATABASE_URL with `_test` appended to the database name. It is created if missing and
migrated with Alembic (so the migration itself is exercised), and every test starts from
empty tables.
"""

import asyncio
import os
import subprocess
import sys
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import asyncpg
import pytest
from sqlalchemy.engine import make_url

BACKEND_DIR = Path(__file__).resolve().parent.parent


# Tests must not depend on a developer's secret; a local .env still provides DATABASE_URL.
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-that-is-long-enough-0123456789")


def _test_database_url() -> str:
    from app.core.config import Settings

    explicit = os.environ.get("TEST_DATABASE_URL")
    if explicit:
        return explicit
    url = make_url(Settings().database_url)
    return url.set(database=f"{url.database}_test").render_as_string(hide_password=False)


TEST_DATABASE_URL = _test_database_url()
if not (make_url(TEST_DATABASE_URL).database or "").endswith("_test"):
    raise RuntimeError(f"Refusing to run tests against a non-test database: {TEST_DATABASE_URL}")

# Must be set before the application settings are first read.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["APP_ENV"] = "test"
os.environ["DEBUG"] = "false"

from app.core.config import get_settings  # noqa: E402

get_settings.cache_clear()

import httpx  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.core.enums import UserRole  # noqa: E402
from app.db.session import get_sessionmaker  # noqa: E402
from app.main import app  # noqa: E402
from app.services.auth import create_user  # noqa: E402
from app.utils.datetime import clinic_today  # noqa: E402

ADMIN_PASSWORD = "Admin123!"
STAFF_PASSWORD = "Staff123!"


async def _create_database_if_missing() -> None:
    url = make_url(TEST_DATABASE_URL)
    conn = await asyncpg.connect(
        user=url.username,
        password=url.password,
        host=url.host,
        port=url.port,
        database="postgres",
    )
    try:
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", url.database)
        if not exists:
            await conn.execute(f'CREATE DATABASE "{url.database}"')
    finally:
        await conn.close()


@pytest.fixture(scope="session", autouse=True)
def _migrated_database() -> None:
    asyncio.run(_create_database_if_missing())
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env={**os.environ, "DATABASE_URL": TEST_DATABASE_URL},
        check=True,
        capture_output=True,
    )


@pytest.fixture(autouse=True)
async def _clean_tables() -> None:
    async with get_sessionmaker()() as session:
        await session.execute(
            text(
                "TRUNCATE users, therapists, therapist_schedule_overrides, patients, "
                "appointments, invoices RESTART IDENTITY CASCADE"
            )
        )
        await session.execute(text("ALTER SEQUENCE invoice_number_seq RESTART"))
        await session.commit()


@pytest.fixture
async def session() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as db_session:
        yield db_session


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test/api/v1") as c:
        yield c


async def _login(client: httpx.AsyncClient, identifier: str, password: str) -> dict[str, str]:
    response = await client.post(
        "/auth/login", json={"identifier": identifier, "password": password}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
async def admin_headers(client: httpx.AsyncClient, session: AsyncSession) -> dict[str, str]:
    await create_user(
        session,
        email="admin@physiodesk.local",
        username="admin",
        password=ADMIN_PASSWORD,
        role=UserRole.ADMIN,
    )
    return await _login(client, "admin@physiodesk.local", ADMIN_PASSWORD)


@pytest.fixture
async def staff_headers(client: httpx.AsyncClient, session: AsyncSession) -> dict[str, str]:
    await create_user(
        session,
        email="staff@physiodesk.local",
        username="staff",
        password=STAFF_PASSWORD,
        role=UserRole.STAFF,
    )
    return await _login(client, "staff", STAFF_PASSWORD)


# --- Data factories (through the public API, so they exercise real validation) --------------

JSON = dict[str, Any]
Factory = Callable[..., Awaitable[JSON]]
Book = Callable[..., Awaitable[httpx.Response]]


@pytest.fixture
def create_therapist(client: httpx.AsyncClient, admin_headers: dict[str, str]) -> Factory:
    async def _create(**overrides: Any) -> JSON:
        payload = {
            "name": "Dr. Test",
            "specialty": "Sports rehab",
            "working_days": [1, 2, 3, 4, 5, 6, 7],
            "start_time": "09:00",
            "end_time": "12:00",
            "slot_duration_minutes": 30,
            **overrides,
        }
        response = await client.post("/therapists", json=payload, headers=admin_headers)
        assert response.status_code == 201, response.text
        return response.json()  # type: ignore[no-any-return]

    return _create


@pytest.fixture
def create_patient(client: httpx.AsyncClient, admin_headers: dict[str, str]) -> Factory:
    counter = iter(range(1, 1000))

    async def _create(**overrides: Any) -> JSON:
        n = next(counter)
        payload = {
            "full_name": f"Patient {n}",
            "phone": f"98410000{n:02d}",
            "age": 30,
            "gender": "FEMALE",
            "condition": "Knee pain",
            **overrides,
        }
        response = await client.post("/patients", json=payload, headers=admin_headers)
        assert response.status_code == 201, response.text
        return response.json()  # type: ignore[no-any-return]

    return _create


@pytest.fixture
def book(client: httpx.AsyncClient, admin_headers: dict[str, str]) -> Book:
    async def _book(
        patient_id: str, therapist_id: str, day: date, start: str, **extra: Any
    ) -> httpx.Response:
        return await client.post(
            "/appointments",
            json={
                "patient_id": patient_id,
                "therapist_id": therapist_id,
                "appointment_date": day.isoformat(),
                "start_time": start,
                "payment_method": "CASH",
                **extra,
            },
            headers=admin_headers,
        )

    return _book


def future_weekday(iso_weekday: int, *, min_days_ahead: int = 1) -> date:
    """The first date at least `min_days_ahead` days from (clinic) today on this weekday."""
    day = clinic_today() + timedelta(days=min_days_ahead)
    while day.isoweekday() != iso_weekday:
        day += timedelta(days=1)
    return day


def tomorrow() -> date:
    return clinic_today() + timedelta(days=1)
