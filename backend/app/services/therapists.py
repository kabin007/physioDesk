"""Therapist roster and schedule management.

Concurrency: every schedule mutation (therapist hours/days/slot size/active flag and
overrides) locks the therapist row `FOR UPDATE`; bookings take the same row `FOR SHARE`.
A schedule change and a booking for the same therapist therefore serialise, so a change can
never be validated against a stale set of appointments.

Integrity rule: a schedule change is rejected (409) if it would leave any upcoming BOOKED
appointment outside the therapist's availability. Past appointments are history and are
never re-validated.
"""

import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import distinct, exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AppointmentStatus
from app.core.exceptions import (
    InvalidSchedule,
    ResourceInUse,
    ScheduleOverrideExists,
    ScheduleOverrideNotFound,
    TherapistNotFound,
)
from app.db.errors import violated_constraint
from app.db.models import Appointment, Therapist, TherapistScheduleOverride
from app.schemas.therapist import (
    ScheduleOverrideCreate,
    ScheduleOverrideUpdate,
    TherapistCreate,
    TherapistListItem,
    TherapistRead,
    TherapistUpdate,
    check_override,
    check_working_hours,
)
from app.services.scheduling import ensure_schedule_change_allowed
from app.utils.datetime import clinic_today

# Fields whose change can invalidate existing bookings.
_SCHEDULE_FIELDS = frozenset(
    {"working_days", "start_time", "end_time", "slot_duration_minutes", "is_active"}
)
_OVERRIDE_UNIQUE = "uq_schedule_override_therapist_date"


async def get_therapist(session: AsyncSession, therapist_id: uuid.UUID) -> Therapist:
    therapist = await session.get(Therapist, therapist_id)
    if therapist is None:
        raise TherapistNotFound()
    return therapist


async def lock_therapist(
    session: AsyncSession, therapist_id: uuid.UUID, *, shared: bool = False
) -> Therapist:
    """Load a therapist with a row lock: FOR UPDATE (schedule changes) or FOR SHARE (bookings)."""
    therapist = await session.get(
        Therapist, therapist_id, with_for_update={"read": True} if shared else True
    )
    if therapist is None:
        raise TherapistNotFound()
    return therapist


async def list_therapists(
    session: AsyncSession, *, is_active: bool | None = None
) -> list[TherapistListItem]:
    query = select(Therapist).order_by(Therapist.name)
    if is_active is not None:
        query = query.where(Therapist.is_active.is_(is_active))
    therapists = (await session.scalars(query)).all()

    seen_rows = await session.execute(
        select(Appointment.therapist_id, func.count(distinct(Appointment.patient_id)))
        .where(
            Appointment.appointment_date == clinic_today(),
            Appointment.status == AppointmentStatus.COMPLETED,
        )
        .group_by(Appointment.therapist_id)
    )
    seen_today: dict[uuid.UUID, int] = {row[0]: row[1] for row in seen_rows}

    return [
        TherapistListItem(
            **TherapistRead.model_validate(t).model_dump(exclude={"weekly_hours"}),
            patients_seen_today=seen_today.get(t.id, 0),
        )
        for t in therapists
    ]


async def create_therapist(session: AsyncSession, data: TherapistCreate) -> Therapist:
    therapist = Therapist(**data.model_dump())
    session.add(therapist)
    await session.commit()
    return therapist


async def update_therapist(
    session: AsyncSession, therapist_id: uuid.UUID, data: TherapistUpdate
) -> Therapist:
    therapist = await lock_therapist(session, therapist_id)
    changes = data.changes()
    for field, value in changes.items():
        setattr(therapist, field, value)

    try:
        check_working_hours(
            therapist.start_time, therapist.end_time, therapist.slot_duration_minutes
        )
    except ValueError as exc:
        raise InvalidSchedule(str(exc)) from exc

    await session.flush()
    if _SCHEDULE_FIELDS & changes.keys():
        await ensure_schedule_change_allowed(session, therapist)
    await session.commit()
    return therapist


async def delete_therapist(session: AsyncSession, therapist_id: uuid.UUID) -> None:
    """Hard-delete a therapist who has no appointments at all.

    Therapists with appointment history are kept (appointments must not lose their
    therapist); deactivate them instead. Assigned patients are unassigned (FK SET NULL) and
    schedule overrides are removed (FK CASCADE).
    """
    therapist = await lock_therapist(session, therapist_id)
    has_appointments = await session.scalar(
        select(exists().where(Appointment.therapist_id == therapist.id))
    )
    if has_appointments:
        raise ResourceInUse(
            "Therapist has appointments and cannot be deleted. "
            "Deactivate them instead (PATCH is_active=false)."
        )
    await session.delete(therapist)
    await session.commit()


# --- Schedule overrides ----------------------------------------------------------------------


def _ensure_not_past(day: date) -> None:
    if day < clinic_today():
        raise InvalidSchedule("Schedule overrides in the past cannot be created or changed.")


async def list_overrides(
    session: AsyncSession,
    therapist_id: uuid.UUID,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> Sequence[TherapistScheduleOverride]:
    await get_therapist(session, therapist_id)
    query = (
        select(TherapistScheduleOverride)
        .where(TherapistScheduleOverride.therapist_id == therapist_id)
        .order_by(TherapistScheduleOverride.date)
    )
    if date_from is not None:
        query = query.where(TherapistScheduleOverride.date >= date_from)
    if date_to is not None:
        query = query.where(TherapistScheduleOverride.date <= date_to)
    return (await session.scalars(query)).all()


async def _get_override(
    session: AsyncSession, therapist_id: uuid.UUID, override_id: uuid.UUID
) -> TherapistScheduleOverride:
    override = await session.get(TherapistScheduleOverride, override_id)
    if override is None or override.therapist_id != therapist_id:
        raise ScheduleOverrideNotFound()
    return override


async def _flush_override(session: AsyncSession) -> None:
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        if violated_constraint(exc) == _OVERRIDE_UNIQUE:
            raise ScheduleOverrideExists() from exc
        raise


async def create_override(
    session: AsyncSession, therapist_id: uuid.UUID, data: ScheduleOverrideCreate
) -> TherapistScheduleOverride:
    therapist = await lock_therapist(session, therapist_id)
    _ensure_not_past(data.date)
    override = TherapistScheduleOverride(therapist_id=therapist.id, **data.model_dump())
    session.add(override)
    await _flush_override(session)
    await ensure_schedule_change_allowed(session, therapist)
    await session.commit()
    return override


async def update_override(
    session: AsyncSession,
    therapist_id: uuid.UUID,
    override_id: uuid.UUID,
    data: ScheduleOverrideUpdate,
) -> TherapistScheduleOverride:
    therapist = await lock_therapist(session, therapist_id)
    override = await _get_override(session, therapist_id, override_id)
    _ensure_not_past(override.date)

    changes = data.changes()
    if changes.get("is_day_off") is True:
        # Switching to a day off implicitly clears custom hours.
        changes.setdefault("start_time", None)
        changes.setdefault("end_time", None)
    for field, value in changes.items():
        setattr(override, field, value)

    _ensure_not_past(override.date)
    try:
        check_override(override.is_day_off, override.start_time, override.end_time)
    except ValueError as exc:
        raise InvalidSchedule(str(exc)) from exc

    await _flush_override(session)
    await ensure_schedule_change_allowed(session, therapist)
    await session.commit()
    return override


async def delete_override(
    session: AsyncSession, therapist_id: uuid.UUID, override_id: uuid.UUID
) -> None:
    therapist = await lock_therapist(session, therapist_id)
    override = await _get_override(session, therapist_id, override_id)
    _ensure_not_past(override.date)
    await session.delete(override)
    await session.flush()
    # Reverting to the regular schedule can also strand bookings (e.g. extra Saturday hours).
    await ensure_schedule_change_allowed(session, therapist)
    await session.commit()
