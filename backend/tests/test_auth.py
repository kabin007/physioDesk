from typing import Any

import httpx
import pytest

from tests.conftest import ADMIN_PASSWORD


async def _tokens(client: httpx.AsyncClient, identifier: str, password: str) -> dict[str, Any]:
    response = await client.post(
        "/auth/login", json={"identifier": identifier, "password": password}
    )
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


@pytest.mark.usefixtures("admin_headers")
@pytest.mark.parametrize(
    "identifier", ["admin@physiodesk.local", "ADMIN", "Admin@PhysioDesk.local"]
)
async def test_login_with_email_or_username_case_insensitive(
    client: httpx.AsyncClient, identifier: str
) -> None:
    body = await _tokens(client, identifier, ADMIN_PASSWORD)
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 30 * 60
    assert body["access_token"] != body["refresh_token"]


@pytest.mark.usefixtures("admin_headers")
@pytest.mark.parametrize(
    ("identifier", "password"),
    [("admin", "wrong-password"), ("nobody@physiodesk.local", ADMIN_PASSWORD)],
)
async def test_login_failure_does_not_reveal_which_part_was_wrong(
    client: httpx.AsyncClient, identifier: str, password: str
) -> None:
    response = await client.post(
        "/auth/login", json={"identifier": identifier, "password": password}
    )
    assert response.status_code == 401
    assert response.json() == {
        "detail": {"code": "INVALID_CREDENTIALS", "message": "Invalid identifier or password."}
    }


async def test_protected_endpoint_requires_token(client: httpx.AsyncClient) -> None:
    for path in ("/auth/me", "/patients", "/dashboard", "/schedule", "/invoices"):
        response = await client.get(path)
        assert response.status_code == 401, path
        assert response.json()["detail"]["code"] == "NOT_AUTHENTICATED"


async def test_garbage_token_rejected(client: httpx.AsyncClient) -> None:
    response = await client.get("/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "INVALID_TOKEN"


async def test_access_token_works(client: httpx.AsyncClient, admin_headers: dict[str, str]) -> None:
    response = await client.get("/auth/me", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "admin"
    assert body["role"] == "ADMIN"
    assert "hashed_password" not in body


@pytest.mark.usefixtures("admin_headers")
async def test_refresh_token_issues_new_working_pair(client: httpx.AsyncClient) -> None:
    tokens = await _tokens(client, "admin", ADMIN_PASSWORD)
    response = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert response.status_code == 200
    new_access = response.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert me.status_code == 200


@pytest.mark.usefixtures("admin_headers")
async def test_refresh_token_cannot_be_used_as_access_token(client: httpx.AsyncClient) -> None:
    tokens = await _tokens(client, "admin", ADMIN_PASSWORD)
    response = await client.get(
        "/patients", headers={"Authorization": f"Bearer {tokens['refresh_token']}"}
    )
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "INVALID_TOKEN"


@pytest.mark.usefixtures("admin_headers")
async def test_access_token_cannot_be_used_to_refresh(client: httpx.AsyncClient) -> None:
    tokens = await _tokens(client, "admin", ADMIN_PASSWORD)
    response = await client.post("/auth/refresh", json={"refresh_token": tokens["access_token"]})
    assert response.status_code == 401


@pytest.mark.usefixtures("admin_headers")
async def test_logout_revokes_access_and_refresh_tokens(client: httpx.AsyncClient) -> None:
    tokens = await _tokens(client, "admin", ADMIN_PASSWORD)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    assert (await client.post("/auth/logout", headers=headers)).status_code == 204

    assert (await client.get("/auth/me", headers=headers)).status_code == 401
    refresh = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refresh.status_code == 401
    # Logging in again works.
    await _tokens(client, "admin", ADMIN_PASSWORD)


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/therapists"),
        ("PATCH", "/therapists/00000000-0000-0000-0000-000000000000"),
        ("DELETE", "/therapists/00000000-0000-0000-0000-000000000000"),
        ("POST", "/therapists/00000000-0000-0000-0000-000000000000/schedule-overrides"),
        ("POST", "/invoices"),
        ("PATCH", "/invoices/00000000-0000-0000-0000-000000000000"),
        ("DELETE", "/invoices/00000000-0000-0000-0000-000000000000"),
    ],
)
async def test_staff_cannot_perform_admin_mutations(
    client: httpx.AsyncClient, staff_headers: dict[str, str], method: str, path: str
) -> None:
    response = await client.request(method, path, json={}, headers=staff_headers)
    # 403 is decided before the body is validated or the resource is looked up.
    assert response.status_code == 403, response.text
    assert response.json()["detail"]["code"] == "FORBIDDEN"


async def test_staff_can_read_therapists_and_invoices(
    client: httpx.AsyncClient, staff_headers: dict[str, str]
) -> None:
    assert (await client.get("/therapists", headers=staff_headers)).status_code == 200
    assert (await client.get("/invoices", headers=staff_headers)).status_code == 200
    assert (await client.get("/dashboard", headers=staff_headers)).status_code == 200
