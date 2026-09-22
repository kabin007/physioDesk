import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.dependencies import CurrentUser, DbSession, Pagination
from app.core.enums import AppointmentStatus
from app.schemas.appointment import AppointmentCreate, AppointmentRead, AppointmentUpdate
from app.schemas.common import Page, error_responses
from app.services import appointments as appointment_service

router = APIRouter(prefix="/appointments", tags=["Appointments"])


@router.get("", summary="List appointments")
async def list_appointments(
    _: CurrentUser,
    session: DbSession,
    page: Pagination,
    day: Annotated[date | None, Query(alias="date", description="Exact date.")] = None,
    date_from: Annotated[date | None, Query(description="Inclusive lower bound.")] = None,
    date_to: Annotated[date | None, Query(description="Inclusive upper bound.")] = None,
    therapist_id: Annotated[uuid.UUID | None, Query()] = None,
    patient_id: Annotated[uuid.UUID | None, Query()] = None,
    appointment_status: Annotated[AppointmentStatus | None, Query(alias="status")] = None,
) -> Page[AppointmentRead]:
    appointments, total = await appointment_service.list_appointments(
        session,
        page,
        day=day,
        date_from=date_from,
        date_to=date_to,
        therapist_id=therapist_id,
        patient_id=patient_id,
        status=appointment_status,
    )
    return Page[AppointmentRead].build(
        [AppointmentRead.model_validate(a) for a in appointments], total, page
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Book an appointment",
    description="Validates the therapist's resolved availability for the date (overrides "
    "first, then the weekly schedule), slot alignment and conflicts. `end_time` is derived "
    "from the therapist's slot duration. Returns 409 APPOINTMENT_CONFLICT when the slot is "
    "taken (also under concurrent requests) and 400 when the slot is not bookable.",
    responses=error_responses(400, 404, 409),
)
async def create_appointment(
    body: AppointmentCreate, _: CurrentUser, session: DbSession
) -> AppointmentRead:
    appointment = await appointment_service.create_appointment(session, body)
    return AppointmentRead.model_validate(appointment)


@router.get("/{appointment_id}", summary="Get an appointment", responses=error_responses(404))
async def get_appointment(
    appointment_id: uuid.UUID, _: CurrentUser, session: DbSession
) -> AppointmentRead:
    return AppointmentRead.model_validate(
        await appointment_service.get_appointment(session, appointment_id)
    )


@router.patch(
    "/{appointment_id}",
    summary="Reschedule or update an appointment",
    description="Changing therapist, date or start time re-runs every booking rule. Status "
    "transitions: BOOKED -> COMPLETED | CANCELLED.",
    responses=error_responses(400, 404, 409),
)
async def update_appointment(
    appointment_id: uuid.UUID, body: AppointmentUpdate, _: CurrentUser, session: DbSession
) -> AppointmentRead:
    appointment = await appointment_service.update_appointment(session, appointment_id, body)
    return AppointmentRead.model_validate(appointment)


@router.delete(
    "/{appointment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cancel an appointment",
    description="Appointments are clinical history, so DELETE cancels (freeing the slot) "
    "instead of erasing the record. Idempotent; completed appointments cannot be cancelled.",
    responses=error_responses(404, 409),
)
async def cancel_appointment(appointment_id: uuid.UUID, _: CurrentUser, session: DbSession) -> None:
    await appointment_service.cancel_appointment(session, appointment_id)
