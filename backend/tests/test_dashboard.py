from datetime import timedelta

import httpx

from app.utils.datetime import clinic_today, utc_now
from tests.conftest import Book, Factory


async def test_dashboard_reflects_database_state(
    client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    create_therapist: Factory,
    create_patient: Factory,
    book: Book,
) -> None:
    today = clinic_today()
    # 09:00-12:00 with 30-minute slots = 6 slots each.
    asha = await create_therapist(name="Asha")
    bina = await create_therapist(name="Bina")
    off = await create_therapist(name="Chandra")
    await create_therapist(name="Dev", is_active=False)
    override = await client.post(
        f"/therapists/{off['id']}/schedule-overrides",
        json={"date": today.isoformat(), "is_day_off": True},
        headers=admin_headers,
    )
    assert override.status_code == 201

    p1, p2, p3 = [await create_patient() for _ in range(3)]

    seen_1 = (await book(p1["id"], asha["id"], today, "09:00")).json()
    seen_2 = (await book(p2["id"], bina["id"], today, "09:00")).json()
    await book(p3["id"], asha["id"], today, "10:00")  # booked, not yet seen
    cancelled = (await book(p3["id"], bina["id"], today, "11:00")).json()
    for appointment in (seen_1, seen_2):
        r = await client.patch(
            f"/appointments/{appointment['id']}",
            json={"status": "COMPLETED"},
            headers=admin_headers,
        )
        assert r.status_code == 200
    await client.delete(f"/appointments/{cancelled['id']}", headers=admin_headers)

    async def invoice(amount: str, **extra: str) -> None:
        r = await client.post(
            "/invoices",
            json={"patient_id": p1["id"], "service": "Session", "subtotal": amount, **extra},
            headers=admin_headers,
        )
        assert r.status_code == 201, r.text

    await invoice("1500.00", status="PAID", payment_method="CASH")
    await invoice("1000.00", discount="100.00", status="PAID", payment_method="CARD")
    await invoice("9999.00")  # DUE: not revenue
    yesterday = (utc_now() - timedelta(days=1, hours=1)).isoformat()
    await invoice("500.00", status="PAID", payment_method="CASH", paid_at=yesterday)

    response = await client.get("/dashboard", headers=admin_headers)
    assert response.status_code == 200, response.text
    stats = response.json()

    assert stats["date"] == today.isoformat()
    assert stats["patients_seen_today"] == 2
    assert stats["therapists_on_duty_today"] == 2  # Chandra off, Dev inactive
    assert stats["revenue_collected_today"] == "2400.00"
    assert stats["total_slots_today"] == 12
    assert stats["booked_slots_today"] == 3  # the cancelled one freed its slot
    assert stats["open_slots_remaining_today"] == 9

    capacity = {c["therapist"]["name"]: c for c in stats["therapist_capacity"]}
    assert set(capacity) == {"Asha", "Bina"}
    assert (capacity["Asha"]["booked_slots"], capacity["Asha"]["open_slots"]) == (2, 4)
    assert (capacity["Bina"]["booked_slots"], capacity["Bina"]["open_slots"]) == (1, 5)

    assert len(stats["recent_patients"]) == 3
    assert stats["recent_patients"][0]["id"] == p3["id"]  # newest first
