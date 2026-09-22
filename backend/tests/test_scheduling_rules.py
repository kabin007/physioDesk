"""Unit tests for the pure availability rules (no database)."""

from datetime import date, time

import pytest

from app.core.enums import AvailabilitySource
from app.core.exceptions import SlotUnavailable, TherapistUnavailable
from app.db.models import Therapist, TherapistScheduleOverride
from app.services.scheduling import generate_slots, resolve_availability, validate_slot

MONDAY = date(2026, 9, 21)
SUNDAY = date(2026, 9, 27)


def _therapist(**overrides: object) -> Therapist:
    fields: dict[str, object] = {
        "name": "T",
        "specialty": "S",
        "working_days": [1, 2, 3, 4, 5],
        "start_time": time(9, 0),
        "end_time": time(17, 0),
        "slot_duration_minutes": 30,
        "is_active": True,
        **overrides,
    }
    return Therapist(**fields)


def _override(**fields: object) -> TherapistScheduleOverride:
    return TherapistScheduleOverride(date=MONDAY, **fields)


def test_regular_working_day() -> None:
    availability = resolve_availability(_therapist(), MONDAY, None)
    assert availability.source is AvailabilitySource.REGULAR
    assert (availability.start_time, availability.end_time) == (time(9), time(17))


def test_non_working_weekday() -> None:
    availability = resolve_availability(_therapist(), SUNDAY, None)
    assert availability.source is AvailabilitySource.NON_WORKING_DAY
    assert not availability.is_working


def test_override_day_off_beats_regular_schedule() -> None:
    availability = resolve_availability(_therapist(), MONDAY, _override(is_day_off=True))
    assert availability.source is AvailabilitySource.OVERRIDE_DAY_OFF
    assert not availability.is_working


def test_override_custom_hours_beat_regular_schedule() -> None:
    override = _override(is_day_off=False, start_time=time(12), end_time=time(15))
    availability = resolve_availability(_therapist(), MONDAY, override)
    assert availability.source is AvailabilitySource.OVERRIDE_HOURS
    assert (availability.start_time, availability.end_time) == (time(12), time(15))


def test_override_can_open_a_normally_non_working_day() -> None:
    override = TherapistScheduleOverride(
        date=SUNDAY, is_day_off=False, start_time=time(10), end_time=time(12)
    )
    assert resolve_availability(_therapist(), SUNDAY, override).is_working


def test_inactive_therapist_is_never_available() -> None:
    availability = resolve_availability(_therapist(is_active=False), MONDAY, None)
    assert availability.source is AvailabilitySource.INACTIVE


def test_generate_slots_drops_trailing_partial_slot() -> None:
    slots = generate_slots(time(9), time(10, 40), 30)
    assert [(s.start_time, s.end_time) for s in slots] == [
        (time(9), time(9, 30)),
        (time(9, 30), time(10)),
        (time(10), time(10, 30)),
    ]


def test_validate_slot() -> None:
    availability = resolve_availability(_therapist(), MONDAY, None)
    assert validate_slot(availability, time(9, 30), 30) == time(10)
    assert validate_slot(availability, time(16, 30), 30) == time(17)
    with pytest.raises(SlotUnavailable):
        validate_slot(availability, time(8, 30), 30)  # before opening
    with pytest.raises(SlotUnavailable):
        validate_slot(availability, time(17), 30)  # would end after closing
    with pytest.raises(SlotUnavailable, match="slot boundary"):
        validate_slot(availability, time(9, 15), 30)  # misaligned
    with pytest.raises(TherapistUnavailable):
        validate_slot(resolve_availability(_therapist(), SUNDAY, None), time(10), 30)
