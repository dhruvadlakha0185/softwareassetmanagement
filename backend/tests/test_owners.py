import pytest


async def test_list_owners_returns_list(client):
    resp = await client.get("/api/v1/owners")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_create_owner_requires_admin(client):
    resp = await client.post("/api/v1/owners", json={
        "email": "x@drl.com", "full_name": "X", "password": "pass"
    })
    assert resp.status_code == 403


async def test_create_owner_and_list(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post("/api/v1/owners", json={
        "email": "newowner@drl.local",
        "full_name": "New Owner",
        "password": "Owner123!",
        "bu": "Finance",
    }, headers=h)
    assert resp.status_code == 201
    user = resp.json()
    assert user["role"] == "APP_OWNER"
    assert user["email"] == "newowner@drl.local"
    uid = user["id"]

    owners = (await client.get("/api/v1/owners")).json()
    assert any(o["id"] == uid for o in owners)

    # cleanup — deactivate
    await client.delete(f"/api/v1/owners/{uid}", headers=h)
    owners_after = (await client.get("/api/v1/owners")).json()
    assert not any(o["id"] == uid for o in owners_after)


async def test_create_duplicate_owner_returns_409(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    payload = {"email": "dup@drl.local", "full_name": "Dup", "password": "pass"}
    r1 = await client.post("/api/v1/owners", json=payload, headers=h)
    assert r1.status_code == 201
    r2 = await client.post("/api/v1/owners", json=payload, headers=h)
    assert r2.status_code == 409
    await client.delete(f"/api/v1/owners/{r1.json()['id']}", headers=h)


async def test_deactivate_preserves_record(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    create = await client.post("/api/v1/owners",
                                json={"email": "deact@drl.local", "full_name": "Deact", "password": "pass"},
                                headers=h)
    uid = create.json()["id"]
    resp = await client.delete(f"/api/v1/owners/{uid}", headers=h)
    assert resp.status_code == 204
    # Deactivated users no longer appear in active list
    owners = (await client.get("/api/v1/owners")).json()
    assert not any(o["id"] == uid for o in owners)


async def test_list_doa_returns_list(client):
    resp = await client.get("/api/v1/owners/doa")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_create_doa_requires_existing_user(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post("/api/v1/owners/doa", json={
        "user_id": "00000000-0000-0000-0000-000000000000",
        "tier": "1",
    }, headers=h)
    assert resp.status_code == 404


async def test_create_and_delete_doa(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    owner = (await client.post("/api/v1/owners",
                                json={"email": "doatest@drl.local", "full_name": "DOA Test", "password": "pass"},
                                headers=h)).json()
    uid = owner["id"]

    doa = await client.post("/api/v1/owners/doa", json={
        "user_id": uid, "tier": "2", "role_label": "Procurement", "alert_scope": "Renewal only"
    }, headers=h)
    assert doa.status_code == 201
    assert doa.json()["tier"] == "2"
    assert doa.json()["user"]["id"] == uid
    did = doa.json()["id"]

    del_resp = await client.delete(f"/api/v1/owners/doa/{did}", headers=h)
    assert del_resp.status_code == 204

    await client.delete(f"/api/v1/owners/{uid}", headers=h)
