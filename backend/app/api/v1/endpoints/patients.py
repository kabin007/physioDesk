import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.dependencies import CurrentUser, DbSession, Pagination
from app.core.enums import AppointmentStatus, InvoiceStatus, PatientStatus
from app.schemas.appointment import AppointmentRead
from app.schemas.common import Page, error_responses
from app.schemas.invoice import InvoiceRead
from app.schemas.patient import PatientCreate, PatientDetail, PatientRead, PatientUpdate
from app.services import patients as patient_service

router = APIRouter(prefix="/patients", tags=["Patients"])


@router.get("", summary="List and search patients")
async def list_patients(
    _: CurrentUser,
    session: DbSession,
    page: Pagination,
    search: Annotated[
        str | None,
        Query(max_length=100, description="Case-insensitive match on name or phone."),
    ] = None,
    therapist_id: Annotated[uuid.UUID | None, Query(description="Assigned therapist.")] = None,
    patient_status: Annotated[PatientStatus | None, Query(alias="status")] = None,
) -> Page[PatientRead]:
    patients, total = await patient_service.list_patients(
        session, page, search=search, therapist_id=therapist_id, status=patient_status
    )
    return Page[PatientRead].build([PatientRead.model_validate(p) for p in patients], total, page)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Create a patient",
    responses=error_responses(400, 404),
)
async def create_patient(body: PatientCreate, _: CurrentUser, session: DbSession) -> PatientRead:
    return PatientRead.model_validate(await patient_service.create_patient(session, body))


@router.get(
    "/{patient_id}",
    summary="Patient profile",
    description="Patient details plus summary statistics (sessions, next appointment, "
    "amounts paid and outstanding).",
    responses=error_responses(404),
)
async def get_patient(patient_id: uuid.UUID, _: CurrentUser, session: DbSession) -> PatientDetail:
    return await patient_service.get_patient_detail(session, patient_id)


@router.patch(
    "/{patient_id}",
    summary="Update a patient",
    responses=error_responses(400, 404),
)
async def update_patient(
    patient_id: uuid.UUID, body: PatientUpdate, _: CurrentUser, session: DbSession
) -> PatientRead:
    patient = await patient_service.update_patient(session, patient_id, body)
    return PatientRead.model_validate(patient)


@router.delete(
    "/{patient_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a patient without history",
    description="Only patients with no appointments and no invoices can be deleted; "
    "otherwise 409 is returned (set status to COMPLETED or ON_HOLD instead).",
    responses=error_responses(404, 409),
)
async def delete_patient(patient_id: uuid.UUID, _: CurrentUser, session: DbSession) -> None:
    await patient_service.delete_patient(session, patient_id)


@router.get(
    "/{patient_id}/appointments",
    summary="Session history",
    description="The patient's appointments, newest first.",
    responses=error_responses(404),
)
async def list_patient_appointments(
    patient_id: uuid.UUID,
    _: CurrentUser,
    session: DbSession,
    page: Pagination,
    appointment_status: Annotated[AppointmentStatus | None, Query(alias="status")] = None,
) -> Page[AppointmentRead]:
    appointments, total = await patient_service.list_patient_appointments(
        session, patient_id, page, status=appointment_status
    )
    return Page[AppointmentRead].build(
        [AppointmentRead.model_validate(a) for a in appointments], total, page
    )


@router.get(
    "/{patient_id}/invoices",
    summary="Billing history",
    description="The patient's invoices, newest first.",
    responses=error_responses(404),
)
async def list_patient_invoices(
    patient_id: uuid.UUID,
    _: CurrentUser,
    session: DbSession,
    page: Pagination,
    invoice_status: Annotated[InvoiceStatus | None, Query(alias="status")] = None,
) -> Page[InvoiceRead]:
    invoices, total = await patient_service.list_patient_invoices(
        session, patient_id, page, status=invoice_status
    )
    return Page[InvoiceRead].build([InvoiceRead.model_validate(i) for i in invoices], total, page)
