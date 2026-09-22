from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.dependencies import CurrentUser, DbSession
from app.schemas.dashboard import DashboardRead
from app.services import dashboard as dashboard_service
from app.utils.datetime import clinic_today

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get(
    "",
    summary="Clinic statistics for today",
    description="Patients seen, therapists on duty, revenue collected, open slots, per-"
    "therapist capacity and recently added patients, computed live from the database. "
    "`date` (clinic-local) defaults to today.",
)
async def get_dashboard(
    _: CurrentUser,
    session: DbSession,
    day: Annotated[date | None, Query(alias="date")] = None,
) -> DashboardRead:
    return await dashboard_service.get_dashboard(session, day or clinic_today())
