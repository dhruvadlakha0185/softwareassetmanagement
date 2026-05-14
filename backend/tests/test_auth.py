import pytest


async def test_login_success(client, admin_user):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@drl.local", "password": "Admin123!"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["role"] == "COE_ADMIN"
    assert data["user"]["email"] == "admin@drl.local"


async def test_login_wrong_password(client, admin_user):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@drl.local", "password": "wrong"},
    )
    assert resp.status_code == 401


async def test_login_unknown_email(client):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@drl.local", "password": "x"},
    )
    assert resp.status_code == 401


async def test_get_me_authenticated(client, admin_token):
    resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "admin@drl.local"
    assert resp.json()["role"] == "COE_ADMIN"


async def test_get_me_no_token(client):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 403  # HTTPBearer returns 403 when no credentials provided


async def test_get_me_invalid_token(client):
    resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not.a.real.token"},
    )
    assert resp.status_code == 401


async def test_refresh_token(client, admin_user):
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@drl.local", "password": "Admin123!"},
    )
    refresh_token = login_resp.json()["refresh_token"]

    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    new_data = resp.json()
    assert "access_token" in new_data
    assert new_data["user"]["email"] == "admin@drl.local"


async def test_refresh_with_invalid_token(client):
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": "garbage"})
    assert resp.status_code == 401
