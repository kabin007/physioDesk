import uuid

import httpx

from tests.conftest import Book, Factory, tomorrow


async def test_create_and_get_patient(
    client: httpx.AsyncClient, staff_headers: dict[str, str], create_therapist: Factory
) -> None:
    therapist = await create_therapist(name="Dr. Asha")
    response = await client.post(
        "/patients",
        json={
            "full_name": "  Sita Sharma ",
            "phone": "+977 9841234567",
            "age": 42,
            "gender": "FEMALE",
            "address": "Lalitpur",
            "condition": "Lower back pain",
            "assigned_therapist_id": therapist["id"],
            "package": "10 sessions",
        },
        headers=staff_headers,
    )
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["full_name"] == "Sita Sharma"  # whitespace stripped
    assert created["status"] == "ACTIVE"
    assert created["assigned_therapist"]["name"] == "Dr. Asha"

    detail = await client.get(f"/patients/{created['id']}", headers=staff_headers)
    assert detail.status_code == 200
    stats = detail.json()["stats"]
    assert stats["completed_sessions"] == 0
    assert stats["next_appointment"] is None
    assert stats["outstanding_balance"] == "0.00"


async def test_create_patient_validation(
    client: httpx.AsyncClient, staff_headers: dict[str, str]
) -> None:
    response = await client.post(
        "/patients",
        json={"full_name": "", "phone": "abc", "age": 0, "gender": "X", "condition": "c"},
        headers=staff_headers,
    )
    assert response.status_code == 422
    bad_fields = {err["loc"][-1] for err in response.json()["detail"]}
    assert {"full_name", "phone", "age", "gender"} <= bad_fields


async def test_create_patient_with_unknown_therapist(
    client: httpx.AsyncClient, staff_headers: dict[str, str]
) -> None:
    response = await client.post(
        "/patients",
        json={
            "full_name": "Ram",
            "phone": "9841000000",
            "age": 50,
            "gender": "MALE",
            "condition": "Shoulder",
            "assigned_therapist_id": str(uuid.uuid4()),
        },
        headers=staff_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "THERAPIST_NOT_FOUND"


async def test_list_search_and_filter(
    client: httpx.AsyncClient,
    staff_headers: dict[str, str],
    create_patient: Factory,
    create_therapist: Factory,
) -> None:
    therapist = await create_therapist()
    await create_patient(full_name="Sita Sharma", phone="9841111111")
    await create_patient(
        full_name="Hari Thapa", phone="9852222222", assigned_therapist_id=therapist["id"]
    )
    await create_patient(full_name="Gita 100%", phone="9803333333", status="ON_HOLD")

    async def names(**params: str) -> list[str]:
        response = await client.get("/patients", params=params, headers=staff_headers)
        assert response.status_code == 200, response.text
        return sorted(p["full_name"] for p in response.json()["items"])

    assert await names(search="sita") == ["Sita Sharma"]
    assert await names(search="98522") == ["Hari Thapa"]
    assert await names(search="%") == ["Gita 100%"]  # wildcard is matched literally
    assert await names(therapist_id=therapist["id"]) == ["Hari Thapa"]
    assert await names(status="ON_HOLD") == ["Gita 100%"]

    page = (await client.get("/patients", params={"page_size": 2}, headers=staff_headers)).json()
    assert (page["total"], page["pages"], page["page"], len(page["items"])) == (3, 2, 1, 2)


async def test_update_patient_partial(
    client: httpx.AsyncClient, staff_headers: dict[str, str], create_patient: Factory
) -> None:
    patient = await create_patient(package="5 sessions")
    response = await client.patch(
        f"/patients/{patient['id']}",
        json={"status": "COMPLETED", "package": None},
        headers=staff_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "COMPLETED"
    assert body["package"] is None
    assert body["full_name"] == patient["full_name"]

    # Non-nullable fields cannot be nulled.
    bad = await client.patch(
        f"/patients/{patient['id']}", json={"full_name": None}, headers=staff_headers
    )
    assert bad.status_code == 422


async def test_delete_patient_without_history(
    client: httpx.AsyncClient, staff_headers: dict[str, str], create_patient: Factory
) -> None:
    patient = await create_patient()
    assert (
        await client.delete(f"/patients/{patient['id']}", headers=staff_headers)
    ).status_code == 204
    assert (
        await client.get(f"/patients/{patient['id']}", headers=staff_headers)
    ).status_code == 404


async def test_delete_patient_with_appointments_is_rejected(
    client: httpx.AsyncClient,
    staff_headers: dict[str, str],
    create_patient: Factory,
    create_therapist: Factory,
    book: Book,
) -> None:
    patient = await create_patient()
    therapist = await create_therapist()
    assert (await book(patient["id"], therapist["id"], tomorrow(), "09:00")).status_code == 201

    response = await client.delete(f"/patients/{patient['id']}", headers=staff_headers)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "RESOURCE_IN_USE"

    history = await client.get(f"/patients/{patient['id']}/appointments", headers=staff_headers)
    assert history.json()["total"] == 1
    detail = (await client.get(f"/patients/{patient['id']}", headers=staff_headers)).json()
    assert detail["stats"]["upcoming_appointments"] == 1
    assert detail["stats"]["next_appointment"]["start_time"] == "09:00"
