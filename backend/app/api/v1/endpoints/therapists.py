import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.dependencies import AdminUser, CurrentUser, DbSession
from app.schemas.common import error_responses
from app.schemas.therapist import (
    ScheduleOverrideCreate,
    ScheduleOverrideRead,
    ScheduleOverrideUpdate,
    TherapistCreate,
    TherapistListItem,
    TherapistRead,
    TherapistUpdate,
)
from app.services import therapists as therapist_service

router = APIRouter(prefix="/therapists", tags=["Therapists"])


@router.get(
    "",
    summary="List therapists",
    description="Roster ordered by name, with weekly hours and patients seen today.",
)
async def list_therapists(
    _: CurrentUser,
    session: DbSession,
    is_active: Annotated[bool | None, Query(description="Filter by active flag.")] = None,
) -> list[TherapistListItem]:
    return await therapist_service.list_therapists(session, is_active=is_active)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Create a therapist (admin)",
    responses=error_responses(403),
)
async def create_therapist(
    body: TherapistCreate, _: AdminUser, session: DbSession
) -> TherapistRead:
    therapist = await therapist_service.create_therapist(session, body)
    return TherapistRead.model_validate(therapist)


@router.get("/{therapist_id}", summary="Get a therapist", responses=error_responses(404))
async def get_therapist(
    therapist_id: uuid.UUID, _: CurrentUser, session: DbSession
) -> TherapistRead:
    return TherapistRead.model_validate(
        await therapist_service.get_therapist(session, therapist_id)
    )


@router.patch(
    "/{therapist_id}",
    summary="Update a therapist and their weekly schedule (admin)",
    description="Partial update. Rejected with 409 if the new schedule (or deactivation) "
    "would leave upcoming booked appointments outside the therapist's availability.",
    responses=error_responses(400, 403, 404, 409),
)
async def update_therapist(
    therapist_id: uuid.UUID, body: TherapistUpdate, _: AdminUser, session: DbSession
) -> TherapistRead:
    therapist = await therapist_service.update_therapist(session, therapist_id, body)
    return TherapistRead.model_validate(therapist)


@router.delete(
    "/{therapist_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a therapist without appointment history (admin)",
    description="Therapists with any appointments cannot be deleted (409); deactivate them "
    "instead. Assigned patients become unassigned.",
    responses=error_responses(403, 404, 409),
)
async def delete_therapist(therapist_id: uuid.UUID, _: AdminUser, session: DbSession) -> None:
    await therapist_service.delete_therapist(session, therapist_id)


# --- Schedule overrides ----------------------------------------------------------------------


@router.get(
    "/{therapist_id}/schedule-overrides",
    summary="List date-specific schedule overrides",
    responses=error_responses(404),
)
async def list_overrides(
    therapist_id: uuid.UUID,
    _: CurrentUser,
    session: DbSession,
    date_from: Annotated[date | None, Query(description="Inclusive lower bound.")] = None,
    date_to: Annotated[date | None, Query(description="Inclusive upper bound.")] = None,
) -> list[ScheduleOverrideRead]:
    overrides = await therapist_service.list_overrides(
        session, therapist_id, date_from=date_from, date_to=date_to
    )
    return [ScheduleOverrideRead.model_validate(o) for o in overrides]


@router.post(
    "/{therapist_id}/schedule-overrides",
    status_code=status.HTTP_201_CREATED,
    summary="Create a day-off or custom-hours override (admin)",
    description="One override per therapist and date. Overrides take precedence over the "
    "weekly schedule. Rejected with 409 if it would strand upcoming booked appointments.",
    responses=error_responses(400, 403, 404, 409),
)
async def create_override(
    therapist_id: uuid.UUID, body: ScheduleOverrideCreate, _: AdminUser, session: DbSession
) -> ScheduleOverrideRead:
    override = await therapist_service.create_override(session, therapist_id, body)
    return ScheduleOverrideRead.model_validate(override)


@router.patch(
    "/{therapist_id}/schedule-overrides/{override_id}",
    summary="Update a schedule override (admin)",
    responses=error_responses(400, 403, 404, 409),
)
async def update_override(
    therapist_id: uuid.UUID,
    override_id: uuid.UUID,
    body: ScheduleOverrideUpdate,
    _: AdminUser,
    session: DbSession,
) -> ScheduleOverrideRead:
    override = await therapist_service.update_override(session, therapist_id, override_id, body)
    return ScheduleOverrideRead.model_validate(override)


@router.delete(
    "/{therapist_id}/schedule-overrides/{override_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a schedule override (admin)",
    responses=error_responses(400, 403, 404, 409),
)
async def delete_override(
    therapist_id: uuid.UUID, override_id: uuid.UUID, _: AdminUser, session: DbSession
) -> None:
    await therapist_service.delete_override(session, therapist_id, override_id)
