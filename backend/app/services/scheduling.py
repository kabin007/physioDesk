"""Therapist availability: the single source of truth for "can this therapist see someone then?".

Resolution order for a therapist on a date:
1. Inactive therapist                  -> unavailable
2. Date-specific override, day off     -> unavailable
3. Date-specific override, custom hours -> available during the override hours
4. Weekday not in the regular schedule -> unavailable
5. Otherwise                           -> available during the regular weekly hours

Slots are generated on the fly from the resolved hours (never persisted): consecutive
`slot_duration_minutes` blocks starting at the resolved start time; a trailing partial block
is not bookable. Appointments occupy exactly one slot and must start on a slot boundary.

The pure functions here (`resolve_availability`, `generate_slots`, `validate_slot`) contain
the rules; the async helpers only load the data they need.
"""

import uuid
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.enums import AppointmentStatus, AvailabilitySource, SlotStatus
from app.core.exceptions import (
    ScheduleChangeConflict,
    SlotUnavailable,
    TherapistNotFound,
    TherapistUnavailable,
)
from app.db.models import Appointment, Therapist, TherapistScheduleOverride
from app.schemas.therapist import ScheduleRead, ScheduleSlotRead, TherapistScheduleRead
from app.utils.datetime import add_minutes, clinic_today, minutes_since_midnight


@dataclass(frozen=True, slots=True)
class DayAvailability:
    day: date
    source: AvailabilitySource
    start_time: time | None = None
    end_time: time | None = None

    @property
    def is_working(self) -> bool:
        return self.start_time is not None and self.end_time is not None


@dataclass(frozen=True, slots=True)
class Slot:
    start_time: time
    end_time: time


@dataclass(frozen=True, slots=True)
class ScheduledSlot:
    start_time: time
    end_time: time
    status: SlotStatus
    appointment: Appointment | None = None


@dataclass(frozen=True, slots=True)
class TherapistDay:
    therapist: Therapist
    availability: DayAvailability
    slots: list[ScheduledSlot]

    @property
    def total_slots(self) -> int:
        return sum(1 for slot in self.slots if slot.status is not SlotStatus.THERAPIST_OFF)

    @property
    def booked_slots(self) -> int:
        return sum(1 for slot in self.slots if slot.status is SlotStatus.BOOKED)

    @property
    def open_slots(self) -> int:
        return sum(1 for slot in self.slots if slot.status is SlotStatus.OPEN)


# --- Pure rules ---------------------------------------------------------------------------


def resolve_availability(
    therapist: Therapist, day: date, override: TherapistScheduleOverride | None
) -> DayAvailability:
    if not therapist.is_active:
        return DayAvailability(day, AvailabilitySource.INACTIVE)
    if override is not None:
        if override.is_day_off:
            return DayAvailability(day, AvailabilitySource.OVERRIDE_DAY_OFF)
        return DayAvailability(
            day, AvailabilitySource.OVERRIDE_HOURS, override.start_time, override.end_time
        )
    if day.isoweekday() not in therapist.working_days:
        return DayAvailability(day, AvailabilitySource.NON_WORKING_DAY)
    return DayAvailability(
        day, AvailabilitySource.REGULAR, therapist.start_time, therapist.end_time
    )


def generate_slots(start: time, end: time, duration_minutes: int) -> list[Slot]:
    """All complete `duration_minutes` slots in [start, end)."""
    slots: list[Slot] = []
    cursor = minutes_since_midnight(start)
    limit = minutes_since_midnight(end)
    while cursor + duration_minutes <= limit:
        slot_start = add_minutes(time.min, cursor)
        slots.append(Slot(slot_start, add_minutes(slot_start, duration_minutes)))
        cursor += duration_minutes
    return slots


_UNAVAILABLE_REASONS = {
    AvailabilitySource.INACTIVE: "The therapist is inactive.",
    AvailabilitySource.OVERRIDE_DAY_OFF: "The therapist has a day off on this date.",
    AvailabilitySource.NON_WORKING_DAY: "The therapist does not work on this weekday.",
}


def validate_slot(availability: DayAvailability, start: time, duration_minutes: int) -> time:
    """Check that an appointment starting at `start` fits the availability exactly.

    Returns the appointment end time; raises a domain error explaining any mismatch.
    """
    if availability.start_time is None or availability.end_time is None:
        raise TherapistUnavailable(_UNAVAILABLE_REASONS[availability.source])

    window = f"{availability.start_time:%H:%M}-{availability.end_time:%H:%M}"
    offset = minutes_since_midnight(start) - minutes_since_midnight(availability.start_time)
    end_minutes = minutes_since_midnight(start) + duration_minutes
    if offset < 0 or end_minutes > minutes_since_midnight(availability.end_time):
        raise SlotUnavailable(
            f"The requested time is outside the therapist's available hours ({window})."
        )
    if offset % duration_minutes:
        raise SlotUnavailable(
            f"Appointments must start on a {duration_minutes}-minute slot boundary "
            f"counted from {availability.start_time:%H:%M}."
        )
    return add_minutes(start, duration_minutes)


def fits_availability(
    appointment: Appointment, availability: DayAvailability, duration: int
) -> bool:
    """Whether an existing appointment still matches a (possibly changed) schedule."""
    if not availability.is_working:
        return False
    try:
        end = validate_slot(availability, appointment.start_time, duration)
    except (SlotUnavailable, TherapistUnavailable):
        return False
    return end == appointment.end_time


# --- Data access helpers ------------------------------------------------------------------


async def get_override(
    session: AsyncSession, therapist_id: uuid.UUID, day: date
) -> TherapistScheduleOverride | None:
    # Bound to a variable: returning the call directly makes mypy pick the untyped overload.
    override = await session.scalar(
        select(TherapistScheduleOverride).where(
            TherapistScheduleOverride.therapist_id == therapist_id,
            TherapistScheduleOverride.date == day,
        )
    )
    return override


async def availability_for(
    session: AsyncSession, therapist: Therapist, day: date
) -> DayAvailability:
    return resolve_availability(therapist, day, await get_override(session, therapist.id, day))


async def build_day_schedules(
    session: AsyncSession,
    day: date,
    *,
    therapist_id: uuid.UUID | None = None,
    only_working: bool = False,
) -> list[TherapistDay]:
    """Slot grid for one date: active therapists (or one therapist), in three queries."""
    if therapist_id is not None:
        therapist = await session.get(Therapist, therapist_id)
        if therapist is None:
            raise TherapistNotFound()
        therapists: Sequence[Therapist] = [therapist]
    else:
        therapists = (
            await session.scalars(
                select(Therapist).where(Therapist.is_active.is_(True)).order_by(Therapist.name)
            )
        ).all()
    if not therapists:
        return []

    ids = [t.id for t in therapists]
    overrides = {
        o.therapist_id: o
        for o in await session.scalars(
            select(TherapistScheduleOverride).where(
                TherapistScheduleOverride.date == day,
                TherapistScheduleOverride.therapist_id.in_(ids),
            )
        )
    }
    appointments_by_therapist: dict[uuid.UUID, dict[time, Appointment]] = defaultdict(dict)
    for appointment in await session.scalars(
        select(Appointment)
        .options(joinedload(Appointment.patient))
        .where(
            Appointment.appointment_date == day,
            Appointment.therapist_id.in_(ids),
            Appointment.status != AppointmentStatus.CANCELLED,
        )
    ):
        appointments_by_therapist[appointment.therapist_id][appointment.start_time] = appointment

    days: list[TherapistDay] = []
    for therapist in therapists:
        availability = resolve_availability(therapist, day, overrides.get(therapist.id))
        if only_working and not availability.is_working:
            continue
        days.append(
            TherapistDay(
                therapist=therapist,
                availability=availability,
                slots=_scheduled_slots(
                    therapist, availability, appointments_by_therapist[therapist.id]
                ),
            )
        )
    return days


def _scheduled_slots(
    therapist: Therapist, availability: DayAvailability, booked: dict[time, Appointment]
) -> list[ScheduledSlot]:
    if availability.start_time is None or availability.end_time is None:
        # Not working: show the regular template as "off" so the grid keeps its rows.
        return [
            ScheduledSlot(slot.start_time, slot.end_time, SlotStatus.THERAPIST_OFF)
            for slot in generate_slots(
                therapist.start_time, therapist.end_time, therapist.slot_duration_minutes
            )
        ]
    result: list[ScheduledSlot] = []
    for slot in generate_slots(
        availability.start_time, availability.end_time, therapist.slot_duration_minutes
    ):
        appointment = booked.get(slot.start_time)
        status = SlotStatus.BOOKED if appointment is not None else SlotStatus.OPEN
        result.append(ScheduledSlot(slot.start_time, slot.end_time, status, appointment))
    return result


async def find_stranded_appointments(
    session: AsyncSession, therapist: Therapist, *, from_date: date | None = None
) -> list[Appointment]:
    """Upcoming BOOKED appointments that no longer fit the therapist's *current* schedule.

    Call after flushing a schedule change (inside the same transaction) to decide whether
    the change is allowed.
    """
    start = from_date or clinic_today()
    appointments = (
        await session.scalars(
            select(Appointment)
            .where(
                Appointment.therapist_id == therapist.id,
                Appointment.status == AppointmentStatus.BOOKED,
                Appointment.appointment_date >= start,
            )
            .order_by(Appointment.appointment_date, Appointment.start_time)
        )
    ).all()
    if not appointments:
        return []

    overrides = {
        o.date: o
        for o in await session.scalars(
            select(TherapistScheduleOverride).where(
                TherapistScheduleOverride.therapist_id == therapist.id,
                TherapistScheduleOverride.date.in_({a.appointment_date for a in appointments}),
            )
        )
    }
    return [
        appointment
        for appointment in appointments
        if not fits_availability(
            appointment,
            resolve_availability(
                therapist, appointment.appointment_date, overrides.get(appointment.appointment_date)
            ),
            therapist.slot_duration_minutes,
        )
    ]


async def ensure_schedule_change_allowed(session: AsyncSession, therapist: Therapist) -> None:
    """Reject a (flushed, uncommitted) schedule change that would strand booked appointments."""
    stranded = await find_stranded_appointments(session, therapist)
    if stranded:
        first = stranded[0]
        raise ScheduleChangeConflict(
            f"{len(stranded)} upcoming booked appointment(s) would fall outside the therapist's "
            f"schedule (first on {first.appointment_date:%Y-%m-%d} at {first.start_time:%H:%M}). "
            "Cancel or reschedule them first."
        )


# --- Read model for GET /schedule ----------------------------------------------------------


def _slot_read(slot: ScheduledSlot) -> ScheduleSlotRead:
    appointment = slot.appointment
    return ScheduleSlotRead(
        start_time=slot.start_time,
        end_time=slot.end_time,
        status=slot.status,
        appointment_id=appointment.id if appointment else None,
        appointment_status=appointment.status if appointment else None,
        patient_id=appointment.patient_id if appointment else None,
        patient_name=appointment.patient.full_name if appointment else None,
    )


async def get_schedule(
    session: AsyncSession, day: date, *, therapist_id: uuid.UUID | None = None
) -> ScheduleRead:
    days = await build_day_schedules(session, day, therapist_id=therapist_id)
    return ScheduleRead(
        date=day,
        therapists=[
            TherapistScheduleRead(
                therapist_id=d.therapist.id,
                therapist_name=d.therapist.name,
                specialty=d.therapist.specialty,
                date=day,
                is_working=d.availability.is_working,
                availability_source=d.availability.source,
                working_start=d.availability.start_time,
                working_end=d.availability.end_time,
                slot_duration_minutes=d.therapist.slot_duration_minutes,
                slots=[_slot_read(slot) for slot in d.slots],
            )
            for d in days
        ],
    )
