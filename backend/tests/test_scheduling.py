"""Booking, rescheduling and double-booking prevention through the API and the database."""

import asyncio
from datetime import time, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import PaymentMethod
from app.db.models import Appointment
from app.utils.datetime import clinic_today
from tests.conftest import Book, Factory, future_weekday, tomorrow


@pytest.fixture
async def setup(create_patient: Factory, create_therapist: Factory) -> dict[str, Any]:
    return {
        "therapist": await create_therapist(),  # every day 09:00-12:00, 30-minute slots
        "alice": await create_patient(full_name="Alice"),
        "bob": await create_patient(full_name="Bob"),
    }


async def test_valid_booking(setup: dict[str, Any], book: Book) -> None:
    response = await book(setup["alice"]["id"], setup["therapist"]["id"], tomorrow(), "09:30")
    assert response.status_code == 201, response.text
    body = response.json()
    assert (body["start_time"], body["end_time"]) == ("09:30", "10:00")  # derived end
    assert body["status"] == "BOOKED"
    assert body["patient"]["full_name"] == "Alice"
    assert body["therapist"]["id"] == setup["therapist"]["id"]


async def test_double_booking_rejected(setup: dict[str, Any], book: Book) -> None:
    therapist_id = setup["therapist"]["id"]
    assert (await book(setup["alice"]["id"], therapist_id, tomorrow(), "10:00")).status_code == 201

    response = await book(setup["bob"]["id"], therapist_id, tomorrow(), "10:00")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "APPOINTMENT_CONFLICT"


async def test_patient_cannot_be_in_two_places(
    setup: dict[str, Any], book: Book, create_therapist: Factory
) -> None:
    other = await create_therapist(name="Dr. Other")
    assert (
        await book(setup["alice"]["id"], setup["therapist"]["id"], tomorrow(), "10:00")
    ).status_code == 201
    response = await book(setup["alice"]["id"], other["id"], tomorrow(), "10:00")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "PATIENT_APPOINTMENT_CONFLICT"


async def test_concurrent_double_booking_only_one_wins(setup: dict[str, Any], book: Book) -> None:
    """Fire simultaneous requests for the same slot: the database guarantees one winner."""
    therapist_id = setup["therapist"]["id"]
    responses = await asyncio.gather(
        book(setup["alice"]["id"], therapist_id, tomorrow(), "11:00"),
        book(setup["bob"]["id"], therapist_id, tomorrow(), "11:00"),
    )
    statuses = sorted(r.status_code for r in responses)
    assert statuses == [201, 409], [r.text for r in responses]


async def test_exclusion_constraint_blocks_overlap_even_without_the_service(
    setup: dict[str, Any], session: AsyncSession
) -> None:
    common = {
        "therapist_id": setup["therapist"]["id"],
        "appointment_date": tomorrow(),
        "payment_method": PaymentMethod.CASH,
    }
    session.add(
        Appointment(
            patient_id=setup["alice"]["id"], start_time=time(9), end_time=time(10), **common
        )
    )
    await session.commit()
    session.add(
        Appointment(
            patient_id=setup["bob"]["id"], start_time=time(9, 30), end_time=time(10), **common
        )
    )
    with pytest.raises(IntegrityError, match="ex_appointments_therapist_no_overlap"):
        await session.commit()


@pytest.mark.parametrize(
    ("start", "code"),
    [("08:30", "SLOT_UNAVAILABLE"), ("12:00", "SLOT_UNAVAILABLE"), ("09:15", "SLOT_UNAVAILABLE")],
)
async def test_booking_outside_hours_or_misaligned_rejected(
    setup: dict[str, Any], book: Book, start: str, code: str
) -> None:
    response = await book(setup["alice"]["id"], setup["therapist"]["id"], tomorrow(), start)
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == code


async def test_non_working_weekday_rejected(
    setup: dict[str, Any], book: Book, create_therapist: Factory
) -> None:
    weekdays_only = await create_therapist(name="Dr. Weekday", working_days=[1, 2, 3, 4, 5])
    response = await book(setup["alice"]["id"], weekdays_only["id"], future_weekday(7), "09:00")
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "THERAPIST_UNAVAILABLE"


async def test_booking_in_the_past_rejected(setup: dict[str, Any], book: Book) -> None:
    yesterday = clinic_today() - timedelta(days=1)
    response = await book(setup["alice"]["id"], setup["therapist"]["id"], yesterday, "09:00")
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "APPOINTMENT_IN_PAST"


async def test_therapist_day_off_rejected(
    setup: dict[str, Any], book: Book, client: httpx.AsyncClient, admin_headers: dict[str, str]
) -> None:
    therapist_id = setup["therapist"]["id"]
    override = await client.post(
        f"/therapists/{therapist_id}/schedule-overrides",
        json={"date": tomorrow().isoformat(), "is_day_off": True, "note": "Conference"},
        headers=admin_headers,
    )
    assert override.status_code == 201, override.text

    response = await book(setup["alice"]["id"], therapist_id, tomorrow(), "09:00")
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "THERAPIST_UNAVAILABLE"


async def test_custom_hours_override_respected(
    setup: dict[str, Any], book: Book, client: httpx.AsyncClient, admin_headers: dict[str, str]
) -> None:
    therapist_id = setup["therapist"]["id"]
    override = await client.post(
        f"/therapists/{therapist_id}/schedule-overrides",
        json={"date": tomorrow().isoformat(), "start_time": "14:00", "end_time": "16:00"},
        headers=admin_headers,
    )
    assert override.status_code == 201, override.text

    # Regular hours no longer apply on that date; the override hours do.
    assert (await book(setup["alice"]["id"], therapist_id, tomorrow(), "09:00")).status_code == 400
    ok = await book(setup["alice"]["id"], therapist_id, tomorrow(), "14:30")
    assert ok.status_code == 201, ok.text

    grid = (
        await client.get(
            "/schedule",
            params={"date": tomorrow().isoformat(), "therapist_id": therapist_id},
            headers=admin_headers,
        )
    ).json()["therapists"][0]
    assert grid["availability_source"] == "OVERRIDE_HOURS"
    assert [s["start_time"] for s in grid["slots"]] == ["14:00", "14:30", "15:00", "15:30"]
    assert [s["status"] for s in grid["slots"]] == ["OPEN", "BOOKED", "OPEN", "OPEN"]
    assert grid["slots"][1]["patient_name"] == "Alice"


async def test_cancelled_appointment_frees_slot(
    setup: dict[str, Any], book: Book, client: httpx.AsyncClient, admin_headers: dict[str, str]
) -> None:
    therapist_id = setup["therapist"]["id"]
    first = await book(setup["alice"]["id"], therapist_id, tomorrow(), "09:00")
    assert first.status_code == 201

    cancel = await client.delete(f"/appointments/{first.json()['id']}", headers=admin_headers)
    assert cancel.status_code == 204
    cancelled = await client.get(f"/appointments/{first.json()['id']}", headers=admin_headers)
    assert cancelled.json()["status"] == "CANCELLED"  # kept as history

    assert (await book(setup["bob"]["id"], therapist_id, tomorrow(), "09:00")).status_code == 201


async def test_reschedule(
    setup: dict[str, Any], book: Book, client: httpx.AsyncClient, admin_headers: dict[str, str]
) -> None:
    appointment = (
        await book(setup["alice"]["id"], setup["therapist"]["id"], tomorrow(), "09:00")
    ).json()
    response = await client.patch(
        f"/appointments/{appointment['id']}",
        json={"start_time": "11:30", "notes": "Moved at patient's request"},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    assert (response.json()["start_time"], response.json()["end_time"]) == ("11:30", "12:00")

    # The old slot is free again.
    assert (
        await book(setup["bob"]["id"], setup["therapist"]["id"], tomorrow(), "09:00")
    ).status_code == 201


async def test_reschedule_into_conflict_rejected(
    setup: dict[str, Any], book: Book, client: httpx.AsyncClient, admin_headers: dict[str, str]
) -> None:
    therapist_id = setup["therapist"]["id"]
    await book(setup["alice"]["id"], therapist_id, tomorrow(), "09:00")
    bobs = (await book(setup["bob"]["id"], therapist_id, tomorrow(), "10:00")).json()

    response = await client.patch(
        f"/appointments/{bobs['id']}", json={"start_time": "09:00"}, headers=admin_headers
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "APPOINTMENT_CONFLICT"
    unchanged = await client.get(f"/appointments/{bobs['id']}", headers=admin_headers)
    assert unchanged.json()["start_time"] == "10:00"


async def test_status_transitions(
    setup: dict[str, Any], book: Book, client: httpx.AsyncClient, admin_headers: dict[str, str]
) -> None:
    today = clinic_today()
    appointment = (
        await book(setup["alice"]["id"], setup["therapist"]["id"], today, "09:00")
    ).json()
    url = f"/appointments/{appointment['id']}"

    done = await client.patch(url, json={"status": "COMPLETED"}, headers=admin_headers)
    assert done.status_code == 200
    # Completed is final.
    again = await client.patch(url, json={"status": "BOOKED"}, headers=admin_headers)
    assert again.status_code == 409
    assert (await client.delete(url, headers=admin_headers)).status_code == 409

    future = (await book(setup["bob"]["id"], setup["therapist"]["id"], tomorrow(), "09:00")).json()
    early = await client.patch(
        f"/appointments/{future['id']}", json={"status": "COMPLETED"}, headers=admin_headers
    )
    assert early.status_code == 409


async def test_schedule_change_that_strands_bookings_is_rejected(
    setup: dict[str, Any], book: Book, client: httpx.AsyncClient, admin_headers: dict[str, str]
) -> None:
    therapist_id = setup["therapist"]["id"]
    await book(setup["alice"]["id"], therapist_id, tomorrow(), "11:30")

    shorter = await client.patch(
        f"/therapists/{therapist_id}", json={"end_time": "11:00"}, headers=admin_headers
    )
    assert shorter.status_code == 409
    assert shorter.json()["detail"]["code"] == "SCHEDULE_CHANGE_CONFLICT"

    day_off = await client.post(
        f"/therapists/{therapist_id}/schedule-overrides",
        json={"date": tomorrow().isoformat(), "is_day_off": True},
        headers=admin_headers,
    )
    assert day_off.status_code == 409

    deactivate = await client.patch(
        f"/therapists/{therapist_id}", json={"is_active": False}, headers=admin_headers
    )
    assert deactivate.status_code == 409

    # A change that keeps the booking valid is fine.
    longer = await client.patch(
        f"/therapists/{therapist_id}", json={"end_time": "13:00"}, headers=admin_headers
    )
    assert longer.status_code == 200


async def test_therapist_with_appointments_cannot_be_deleted(
    setup: dict[str, Any], book: Book, client: httpx.AsyncClient, admin_headers: dict[str, str]
) -> None:
    therapist_id = setup["therapist"]["id"]
    await book(setup["alice"]["id"], therapist_id, tomorrow(), "09:00")
    response = await client.delete(f"/therapists/{therapist_id}", headers=admin_headers)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "RESOURCE_IN_USE"


async def test_duplicate_override_rejected(
    setup: dict[str, Any], client: httpx.AsyncClient, admin_headers: dict[str, str]
) -> None:
    url = f"/therapists/{setup['therapist']['id']}/schedule-overrides"
    body = {"date": tomorrow().isoformat(), "is_day_off": True}
    assert (await client.post(url, json=body, headers=admin_headers)).status_code == 201
    duplicate = await client.post(url, json=body, headers=admin_headers)
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "SCHEDULE_OVERRIDE_EXISTS"
