import httpx
import pytest

from tests.conftest import Factory


@pytest.fixture
async def patient(create_patient: Factory) -> dict[str, str]:
    return await create_patient(full_name="Billing Patient")


async def test_invoice_total_is_computed_server_side(
    client: httpx.AsyncClient, admin_headers: dict[str, str], patient: dict[str, str]
) -> None:
    response = await client.post(
        "/invoices",
        json={
            "patient_id": patient["id"],
            "service": "Physiotherapy x5",
            "subtotal": "5000.00",
            "discount": "750.50",
        },
        headers=admin_headers,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["total"] == "4249.50"
    assert body["status"] == "DUE"
    assert body["paid_at"] is None
    assert body["invoice_number"].startswith("INV-") and body["invoice_number"].endswith("000001")


async def test_client_supplied_total_is_rejected(
    client: httpx.AsyncClient, admin_headers: dict[str, str], patient: dict[str, str]
) -> None:
    response = await client.post(
        "/invoices",
        json={"patient_id": patient["id"], "service": "X", "subtotal": "10", "total": "1"},
        headers=admin_headers,
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "amounts",
    [
        {"subtotal": "100.00", "discount": "100.01"},  # discount > subtotal
        {"subtotal": "100.00", "discount": "-1"},
        {"subtotal": "-5"},
        {"subtotal": "10.001"},  # more than 2 decimal places
    ],
)
async def test_invalid_amounts_rejected(
    client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    patient: dict[str, str],
    amounts: dict[str, str],
) -> None:
    response = await client.post(
        "/invoices",
        json={"patient_id": patient["id"], "service": "X", **amounts},
        headers=admin_headers,
    )
    assert response.status_code == 422


async def test_mark_paid_then_void(
    client: httpx.AsyncClient, admin_headers: dict[str, str], patient: dict[str, str]
) -> None:
    invoice = (
        await client.post(
            "/invoices",
            json={"patient_id": patient["id"], "service": "Session", "subtotal": "1500"},
            headers=admin_headers,
        )
    ).json()
    url = f"/invoices/{invoice['id']}"

    missing_method = await client.patch(url, json={"status": "PAID"}, headers=admin_headers)
    assert missing_method.status_code == 400

    paid = await client.patch(
        url, json={"status": "PAID", "payment_method": "CARD"}, headers=admin_headers
    )
    assert paid.status_code == 200
    assert paid.json()["paid_at"] is not None

    # Discount raised above subtotal after merging with stored values.
    bad = await client.patch(url, json={"discount": "2000"}, headers=admin_headers)
    assert bad.status_code == 400

    assert (await client.delete(url, headers=admin_headers)).status_code == 204
    voided = await client.get(url, headers=admin_headers)
    assert voided.json()["status"] == "VOID"  # history preserved
    frozen = await client.patch(url, json={"service": "Edited"}, headers=admin_headers)
    assert frozen.status_code == 409


async def test_staff_can_read_but_not_create_invoices(
    client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    staff_headers: dict[str, str],
    patient: dict[str, str],
) -> None:
    payload = {"patient_id": patient["id"], "service": "Session", "subtotal": "1000"}
    assert (await client.post("/invoices", json=payload, headers=staff_headers)).status_code == 403
    assert (await client.post("/invoices", json=payload, headers=admin_headers)).status_code == 201

    listing = await client.get("/invoices", params={"status": "DUE"}, headers=staff_headers)
    assert listing.status_code == 200
    assert listing.json()["total"] == 1
    history = await client.get(f"/patients/{patient['id']}/invoices", headers=staff_headers)
    assert history.json()["items"][0]["total"] == "1000.00"
