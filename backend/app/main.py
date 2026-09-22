"""Application factory and entry point (`fastapi dev app/main.py` / `uvicorn app.main:app`)."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.db.session import get_engine

logger = logging.getLogger("app")

OPENAPI_TAGS = [
    {"name": "Authentication", "description": "Login, token refresh, logout and profile."},
    {"name": "Dashboard", "description": "Live statistics computed from clinic data."},
    {"name": "Patients", "description": "Patient records, session and billing history."},
    {"name": "Therapists", "description": "Therapist roster, weekly schedules and overrides."},
    {"name": "Appointments", "description": "Booking, rescheduling and cancellation."},
    {"name": "Scheduling", "description": "Generated availability grid per therapist/day."},
    {"name": "Billing", "description": "Invoices. Deleting an invoice voids it."},
    {"name": "System", "description": "Liveness and readiness probes."},
]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    logger.info(
        "Starting %s (env=%s, clinic timezone=%s)",
        settings.app_name,
        settings.app_env,
        settings.clinic_timezone,
    )
    yield
    await get_engine().dispose()
    logger.info("Shut down %s", settings.app_name)


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

    app = FastAPI(
        title=f"{settings.app_name} API",
        version="1.0.0",
        description="REST API for PhysioDesk, a physiotherapy clinic management system. "
        "Authenticate via **POST /api/v1/auth/login**, then use **Authorize** with the "
        "access token.",
        debug=settings.debug,
        lifespan=lifespan,
        openapi_tags=OPENAPI_TAGS,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_exception_handlers(app)
    app.include_router(api_router, prefix=settings.api_v1_prefix)

    @app.get("/health", tags=["System"], summary="Liveness probe")
    async def health() -> dict[str, str]:
        return {"status": "ok", "app": settings.app_name, "env": settings.app_env}

    @app.get(
        "/health/ready",
        tags=["System"],
        summary="Readiness probe (checks database connectivity)",
        responses={503: {"description": "Database unreachable"}},
    )
    async def ready() -> JSONResponse:
        try:
            async with get_engine().connect() as conn:
                await conn.execute(text("SELECT 1"))
        except (SQLAlchemyError, OSError):
            logger.exception("Readiness check failed: database unreachable")
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"status": "unavailable", "database": "unreachable"},
            )
        return JSONResponse(content={"status": "ok", "database": "ok"})

    return app


app = create_app()
