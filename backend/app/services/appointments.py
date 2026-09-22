"""Appointment booking, rescheduling and cancellation.

Double-booking protection is layered:
1. The therapist row is locked FOR SHARE, serialising bookings against schedule changes
   (which take FOR UPDATE), so availability cannot change mid-booking.
2. An overlap query gives a precise, friendly 409 in the common case.
3. The PostgreSQL exclusion constraints on (therapist, time range) and (patient, time range)
   for non-cancelled rows are the actual guarantee: when two requests race past step 2, the
   database rejects the second insert/update and it is translated into the same 409.
"""

import uuid
from collections.abc import Sequence
from datetime import date, time

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.enums import AppointmentStatus
from app.core.exceptions import (
    AppointmentConflict,
    AppointmentInPast,
    AppointmentNotFound,
    InvalidStatusTransition,
    PatientAppointmentConflict,
    PatientNotFound,
    TherapistInactive,
)
from app.db.errors import violated_constraint
from app.db.models import Appointment, Patient
from app.db.models.appointment import PATIENT_OVERLAP_CONSTRAINT, THERAPIST_OVERLAP_CONSTRAINT
from app.schemas.appointment import AppointmentCreate, AppointmentUpdate
from app.schemas.common import PageParams
from app.services.scheduling import availability_for, validate_slot
from app.services.therapists import lock_therapist
from app.utils.datetime import clinic_today

_RESCHEDULE_FIELDS = frozenset({"therapist_id", "appointment_date", "start_time"})

# Allowed status changes. COMPLETED and CANCELLED are final so history stays trustworthy.
_TRANSITIONS: dict[AppointmentStatus, frozenset[AppointmentStatus]] = {
    AppointmentStatus.BOOKED: frozenset({AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED}),
    AppointmentStatus.COMPLETED: frozenset(),
    AppointmentStatus.CANCELLED: frozenset(),
}


def _with_relations(query: Select[tuple[Appointment]]) -> Select[tuple[Appointment]]:
    return query.options(joinedload(Appointment.patient), joinedload(Appointment.therapist))


async def get_appointment(session: AsyncSession, appointment_id: uuid.UUID) -> Appointment:
    appointment = await session.scalar(
        _with_relations(select(Appointment)).where(Appointment.id == appointment_id)
    )
    if appointment is None:
        raise AppointmentNotFound()
    return appointment


async def list_appointments(
    session: AsyncSession,
    page: PageParams,
    *,
    day: date | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    therapist_id: uuid.UUID | None = None,
    patient_id: uuid.UUID | None = None,
    status: AppointmentStatus | None = None,
) -> tuple[Sequence[Appointment], int]:
    conditions = []
    if day is not None:
        conditions.append(Appointment.appointment_date == day)
    if date_from is not None:
        conditions.append(Appointment.appointment_date >= date_from)
    if date_to is not None:
        conditions.append(Appointment.appointment_date <= date_to)
    if therapist_id is not None:
        conditions.append(Appointment.therapist_id == therapist_id)
    if patient_id is not None:
        conditions.append(Appointment.patient_id == patient_id)
    if status is not None:
        conditions.append(Appointment.status == status)

    total = await session.scalar(select(func.count(Appointment.id)).where(*conditions)) or 0
    appointments = (
        await session.scalars(
            _with_relations(select(Appointment))
            .where(*conditions)
            .order_by(Appointment.appointment_date, Appointment.start_time, Appointment.id)
            .offset(page.offset)
            .limit(page.page_size)
        )
    ).all()
    return appointments, total


async def _validate_slot_request(
    session: AsyncSession,
    *,
    patient_id: uuid.UUID,
    therapist_id: uuid.UUID,
    day: date,
    start: time,
    exclude_id: uuid.UUID | None = None,
) -> time:
    """Run every booking rule for a (new or moved) appointment. Returns the end time."""
    therapist = await lock_therapist(session, therapist_id, shared=True)
    if not therapist.is_active:
        raise TherapistInactive("Appointments cannot be booked with an inactive therapist.")
    if day < clinic_today():
        raise AppointmentInPast()

    availability = await availability_for(session, therapist, day)
    end = validate_slot(availability, start, therapist.slot_duration_minutes)

    # Friendly pre-check. Not relied upon for correctness (see module docstring).
    overlapping = and_(
        Appointment.appointment_date == day,
        Appointment.start_time < end,
        Appointment.end_time > start,
        Appointment.status != AppointmentStatus.CANCELLED,
        or_(Appointment.therapist_id == therapist_id, Appointment.patient_id == patient_id),
    )
    if exclude_id is not None:
        overlapping = and_(overlapping, Appointment.id != exclude_id)
    clashes = (await session.scalars(select(Appointment).where(overlapping))).all()
    if any(c.therapist_id == therapist_id for c in clashes):
        raise AppointmentConflict()
    if clashes:
        raise PatientAppointmentConflict()
    return end


async def _flush(session: AsyncSession) -> None:
    """Flush, translating exclusion-constraint violations (lost races) into 409s."""
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        constraint = violated_constraint(exc)
        if constraint == THERAPIST_OVERLAP_CONSTRAINT:
            raise AppointmentConflict() from exc
        if constraint == PATIENT_OVERLAP_CONSTRAINT:
            raise PatientAppointmentConflict() from exc
        raise


async def create_appointment(session: AsyncSession, data: AppointmentCreate) -> Appointment:
    if await session.get(Patient, data.patient_id) is None:
        raise PatientNotFound()
    end = await _validate_slot_request(
        session,
        patient_id=data.patient_id,
        therapist_id=data.therapist_id,
        day=data.appointment_date,
        start=data.start_time,
    )
    appointment = Appointment(**data.model_dump(), end_time=end)
    session.add(appointment)
    await _flush(session)
    await session.commit()
    return await get_appointment(session, appointment.id)


def _check_transition(current: AppointmentStatus, target: AppointmentStatus) -> None:
    if target == current:
        return
    if target not in _TRANSITIONS[current]:
        raise InvalidStatusTransition(
            f"Cannot change an appointment from {current.value} to {target.value}."
        )


async def update_appointment(
    session: AsyncSession, appointment_id: uuid.UUID, data: AppointmentUpdate
) -> Appointment:
    appointment = await get_appointment(session, appointment_id)
    changes = data.changes()

    new_status = changes.get("status")
    if isinstance(new_status, AppointmentStatus):
        _check_transition(appointment.status, new_status)
        if (
            new_status is AppointmentStatus.COMPLETED
            and appointment.appointment_date > clinic_today()
        ):
            raise InvalidStatusTransition("A future appointment cannot be marked COMPLETED.")

    reschedule = {
        field: value
        for field, value in changes.items()
        if field in _RESCHEDULE_FIELDS and getattr(appointment, field) != value
    }
    if reschedule:
        if appointment.status is not AppointmentStatus.BOOKED or new_status not in (
            None,
            AppointmentStatus.BOOKED,
        ):
            raise InvalidStatusTransition("Only BOOKED appointments can be rescheduled.")
        # PatchModel rejects explicit nulls, so None here means "not being changed".
        therapist_id = data.therapist_id or appointment.therapist_id
        day = data.appointment_date or appointment.appointment_date
        start = data.start_time if data.start_time is not None else appointment.start_time
        appointment.end_time = await _validate_slot_request(
            session,
            patient_id=appointment.patient_id,
            therapist_id=therapist_id,
            day=day,
            start=start,
            exclude_id=appointment.id,
        )

    for field, value in changes.items():
        setattr(appointment, field, value)
    await _flush(session)
    await session.commit()
    # Reload so a changed therapist relationship is reflected in the response.
    await session.refresh(appointment, attribute_names=["therapist", "patient"])
    return appointment


async def cancel_appointment(session: AsyncSession, appointment_id: uuid.UUID) -> None:
    """DELETE semantics: cancel (idempotently) rather than erase clinical history."""
    appointment = await get_appointment(session, appointment_id)
    if appointment.status is AppointmentStatus.CANCELLED:
        return
    _check_transition(appointment.status, AppointmentStatus.CANCELLED)
    appointment.status = AppointmentStatus.CANCELLED
    await session.commit()
