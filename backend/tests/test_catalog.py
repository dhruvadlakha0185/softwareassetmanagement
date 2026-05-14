import pytest


async def test_list_catalog_returns_list(client):
    resp = await client.get("/api/v1/catalog")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_create_catalog_requires_admin(client):
    resp = await client.post("/api/v1/catalog", json={"canonical_name": "Test SW"})
    assert resp.status_code in (401, 403)


async def test_create_and_get_catalog_entry(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post("/api/v1/catalog", json={
        "canonical_name": "Test Software Alpha",
        "publisher": "ACME Corp",
        "gxp_flag": "no",
        "vendor_risk": "LOW",
        "deployment": "cloud",
    }, headers=h)
    assert resp.status_code == 201
    sw = resp.json()
    assert sw["canonical_name"] == "Test Software Alpha"
    assert sw["sw_id"].startswith("SW-")

    get_resp = await client.get(f"/api/v1/catalog/{sw['sw_id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["canonical_name"] == "Test Software Alpha"

    # cleanup
    await client.delete(f"/api/v1/catalog/{sw['sw_id']}", headers=h)


async def test_duplicate_canonical_name_returns_409(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    payload = {"canonical_name": "Dup SW Beta", "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud"}
    r1 = await client.post("/api/v1/catalog", json=payload, headers=h)
    assert r1.status_code == 201
    r2 = await client.post("/api/v1/catalog", json=payload, headers=h)
    assert r2.status_code == 409
    await client.delete(f"/api/v1/catalog/{r1.json()['sw_id']}", headers=h)


async def test_update_catalog_entry(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    create = await client.post("/api/v1/catalog", json={
        "canonical_name": "Update Test SW",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
    }, headers=h)
    sw_id = create.json()["sw_id"]

    update = await client.put(f"/api/v1/catalog/{sw_id}", json={"notes": "Updated note"}, headers=h)
    assert update.status_code == 200
    assert update.json()["notes"] == "Updated note"

    await client.delete(f"/api/v1/catalog/{sw_id}", headers=h)


async def test_add_and_delete_alias(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    sw = (await client.post("/api/v1/catalog", json={
        "canonical_name": "Alias Test SW",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
    }, headers=h)).json()
    sw_id = sw["sw_id"]

    alias_resp = await client.post(f"/api/v1/catalog/{sw_id}/aliases",
                                   json={"alias_name": "AliasTestAlias", "source_name": "test"},
                                   headers=h)
    assert alias_resp.status_code == 201
    alias_id = alias_resp.json()["id"]

    # alias appears on GET
    entry = (await client.get(f"/api/v1/catalog/{sw_id}")).json()
    assert any(a["alias_name"] == "AliasTestAlias" for a in entry["aliases"])

    del_alias = await client.delete(f"/api/v1/catalog/aliases/{alias_id}", headers=h)
    assert del_alias.status_code == 204

    await client.delete(f"/api/v1/catalog/{sw_id}", headers=h)


async def test_sw_ids_are_sequential(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    sw1 = (await client.post("/api/v1/catalog", json={
        "canonical_name": "SeqTest1", "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
    }, headers=h)).json()
    sw2 = (await client.post("/api/v1/catalog", json={
        "canonical_name": "SeqTest2", "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
    }, headers=h)).json()
    n1 = int(sw1["sw_id"].split("-")[1])
    n2 = int(sw2["sw_id"].split("-")[1])
    assert n2 == n1 + 1

    await client.delete(f"/api/v1/catalog/{sw1['sw_id']}", headers=h)
    await client.delete(f"/api/v1/catalog/{sw2['sw_id']}", headers=h)


async def test_brief_endpoint(client):
    resp = await client.get("/api/v1/catalog/brief")
    assert resp.status_code == 200
    if resp.json():
        item = resp.json()[0]
        assert "sw_id" in item
        assert "canonical_name" in item
