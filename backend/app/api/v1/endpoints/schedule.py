import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.dependencies import CurrentUser, DbSession
from app.schemas.common import error_responses
from app.schemas.therapist import ScheduleRead
from app.services import scheduling
from app.utils.datetime import clinic_today

router = APIRouter(prefix="/schedule", tags=["Scheduling"])


@router.get(
    "",
    summary="Slot grid for a date",
    description="For each active therapist (or the given one), every slot of the day with "
    "status OPEN, BOOKED (with patient) or THERAPIST_OFF. Slots are generated from the "
    "weekly schedule and date overrides; they are not stored.",
    responses=error_responses(404),
)
async def get_schedule(
    _: CurrentUser,
    session: DbSession,
    day: Annotated[
        date | None,
        Query(alias="date", description="Clinic-local date; defaults to today."),
    ] = None,
    therapist_id: Annotated[uuid.UUID | None, Query()] = None,
) -> ScheduleRead:
    return await scheduling.get_schedule(session, day or clinic_today(), therapist_id=therapist_id)
