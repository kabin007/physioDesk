"""Patient records and their session/billing history.

Deletion policy: a patient can only be hard-deleted while they have no appointments and no
invoices (clinical and billing history must never be orphaned or cascaded away; the FKs are
RESTRICT as a backstop). Otherwise the API returns 409 and the patient should be moved to
status COMPLETED or ON_HOLD instead.
"""

import uuid
from collections.abc import Sequence
from decimal import Decimal

from sqlalchemy import Select, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.enums import AppointmentStatus, InvoiceStatus, PatientStatus
from app.core.exceptions import PatientNotFound, ResourceInUse, TherapistInactive
from app.db.models import Appointment, Invoice, Patient, Therapist
from app.schemas.common import PageParams
from app.schemas.patient import (
    NextAppointment,
    PatientCreate,
    PatientDetail,
    PatientRead,
    PatientStats,
    PatientUpdate,
)
from app.services.therapists import get_therapist
from app.utils.datetime import clinic_now


def contains_pattern(term: str) -> str:
    """ILIKE pattern matching `term` anywhere, with LIKE wildcards in the term escaped."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def get_patient(session: AsyncSession, patient_id: uuid.UUID) -> Patient:
    patient = await session.get(
        Patient, patient_id, options=[selectinload(Patient.assigned_therapist)]
    )
    if patient is None:
        raise PatientNotFound()
    return patient


async def _load_therapist(session: AsyncSession, patient: Patient) -> None:
    # Explicit async load of the relationship after a write; lazy loading is not available
    # under asyncio.
    await session.refresh(patient, attribute_names=["assigned_therapist"])


async def _validate_therapist_assignment(
    session: AsyncSession, therapist_id: uuid.UUID | None
) -> None:
    if therapist_id is None:
        return
    therapist: Therapist = await get_therapist(session, therapist_id)
    if not therapist.is_active:
        raise TherapistInactive("Patients can only be assigned to active therapists.")


async def list_patients(
    session: AsyncSession,
    page: PageParams,
    *,
    search: str | None = None,
    therapist_id: uuid.UUID | None = None,
    status: PatientStatus | None = None,
) -> tuple[Sequence[Patient], int]:
    query: Select[tuple[Patient]] = select(Patient)
    if search:
        pattern = contains_pattern(search.strip())
        query = query.where(or_(Patient.full_name.ilike(pattern), Patient.phone.ilike(pattern)))
    if therapist_id is not None:
        query = query.where(Patient.assigned_therapist_id == therapist_id)
    if status is not None:
        query = query.where(Patient.status == status)

    total = await session.scalar(select(func.count()).select_from(query.subquery())) or 0
    patients = (
        await session.scalars(
            query.options(selectinload(Patient.assigned_therapist))
            .order_by(Patient.created_at.desc(), Patient.id)
            .offset(page.offset)
            .limit(page.page_size)
        )
    ).all()
    return patients, total


async def create_patient(session: AsyncSession, data: PatientCreate) -> Patient:
    await _validate_therapist_assignment(session, data.assigned_therapist_id)
    patient = Patient(**data.model_dump())
    session.add(patient)
    await session.commit()
    await _load_therapist(session, patient)
    return patient


async def update_patient(
    session: AsyncSession, patient_id: uuid.UUID, data: PatientUpdate
) -> Patient:
    patient = await get_patient(session, patient_id)
    changes = data.changes()
    new_therapist_id = changes.get("assigned_therapist_id")
    if (
        isinstance(new_therapist_id, uuid.UUID)
        and new_therapist_id != patient.assigned_therapist_id
    ):
        await _validate_therapist_assignment(session, new_therapist_id)
    for field, value in changes.items():
        setattr(patient, field, value)
    await session.commit()
    await _load_therapist(session, patient)
    return patient


async def delete_patient(session: AsyncSession, patient_id: uuid.UUID) -> None:
    patient = await get_patient(session, patient_id)
    appointment_count = await session.scalar(
        select(func.count()).where(Appointment.patient_id == patient.id)
    )
    invoice_count = await session.scalar(
        select(func.count()).where(Invoice.patient_id == patient.id)
    )
    if appointment_count or invoice_count:
        raise ResourceInUse(
            f"Patient has {appointment_count} appointment(s) and {invoice_count} invoice(s) "
            "and cannot be deleted. Set their status to COMPLETED or ON_HOLD instead."
        )
    await session.delete(patient)
    await session.commit()


# --- Profile ---------------------------------------------------------------------------------


async def get_patient_detail(session: AsyncSession, patient_id: uuid.UUID) -> PatientDetail:
    patient = await get_patient(session, patient_id)
    now = clinic_now()
    today, current_time = now.date(), now.time().replace(second=0, microsecond=0)
    is_upcoming = or_(
        Appointment.appointment_date > today,
        (Appointment.appointment_date == today) & (Appointment.start_time >= current_time),
    )

    counts = (
        await session.execute(
            select(
                func.count().filter(Appointment.status == AppointmentStatus.COMPLETED),
                func.count().filter(Appointment.status == AppointmentStatus.BOOKED, is_upcoming),
                func.count().filter(Appointment.status == AppointmentStatus.CANCELLED),
                func.max(Appointment.appointment_date).filter(
                    Appointment.status == AppointmentStatus.COMPLETED
                ),
            ).where(Appointment.patient_id == patient.id)
        )
    ).one()

    next_appointment = await session.scalar(
        select(Appointment)
        .options(joinedload(Appointment.therapist))
        .where(
            Appointment.patient_id == patient.id,
            Appointment.status == AppointmentStatus.BOOKED,
            is_upcoming,
        )
        .order_by(Appointment.appointment_date, Appointment.start_time)
        .limit(1)
    )

    zero = Decimal("0.00")
    money = (
        await session.execute(
            select(
                func.coalesce(
                    func.sum(case((Invoice.status == InvoiceStatus.PAID, Invoice.total))), zero
                ),
                func.coalesce(
                    func.sum(case((Invoice.status == InvoiceStatus.DUE, Invoice.total))), zero
                ),
            ).where(Invoice.patient_id == patient.id)
        )
    ).one()

    return PatientDetail(
        **PatientRead.model_validate(patient).model_dump(),
        stats=PatientStats(
            completed_sessions=counts[0],
            upcoming_appointments=counts[1],
            cancelled_appointments=counts[2],
            last_visit_date=counts[3],
            next_appointment=(
                NextAppointment(
                    id=next_appointment.id,
                    appointment_date=next_appointment.appointment_date,
                    start_time=next_appointment.start_time,
                    therapist_name=next_appointment.therapist.name,
                )
                if next_appointment
                else None
            ),
            total_paid=money[0],
            outstanding_balance=money[1],
        ),
    )


async def list_patient_appointments(
    session: AsyncSession,
    patient_id: uuid.UUID,
    page: PageParams,
    *,
    status: AppointmentStatus | None = None,
) -> tuple[Sequence[Appointment], int]:
    await get_patient(session, patient_id)
    condition = [Appointment.patient_id == patient_id]
    if status is not None:
        condition.append(Appointment.status == status)
    total = await session.scalar(select(func.count()).where(*condition)) or 0
    appointments = (
        await session.scalars(
            select(Appointment)
            .options(joinedload(Appointment.therapist), joinedload(Appointment.patient))
            .where(*condition)
            .order_by(Appointment.appointment_date.desc(), Appointment.start_time.desc())
            .offset(page.offset)
            .limit(page.page_size)
        )
    ).all()
    return appointments, total


async def list_patient_invoices(
    session: AsyncSession,
    patient_id: uuid.UUID,
    page: PageParams,
    *,
    status: InvoiceStatus | None = None,
) -> tuple[Sequence[Invoice], int]:
    await get_patient(session, patient_id)
    condition = [Invoice.patient_id == patient_id]
    if status is not None:
        condition.append(Invoice.status == status)
    total = await session.scalar(select(func.count()).where(*condition)) or 0
    invoices = (
        await session.scalars(
            select(Invoice)
            .options(joinedload(Invoice.patient))
            .where(*condition)
            .order_by(Invoice.issued_at.desc())
            .offset(page.offset)
            .limit(page.page_size)
        )
    ).all()
    return invoices, total
