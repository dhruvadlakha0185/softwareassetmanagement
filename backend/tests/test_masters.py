import pytest


async def test_get_all_masters_returns_expected_keys(client):
    resp = await client.get("/api/v1/masters/all")
    assert resp.status_code == 200
    data = resp.json()
    for key in ("categories", "vendors", "metrics", "sources", "methods", "regions"):
        assert key in data


async def test_create_category_requires_admin(client):
    resp = await client.post("/api/v1/masters/categories", json={"name": "Test Cat"})
    assert resp.status_code in (401, 403)


async def test_create_list_delete_category(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}

    resp = await client.post("/api/v1/masters/categories",
                             json={"name": "TempCategory", "gxp_applicable": "no"}, headers=h)
    assert resp.status_code == 201
    cat = resp.json()
    assert cat["name"] == "TempCategory"
    cat_id = cat["id"]

    list_resp = await client.get("/api/v1/masters/categories")
    assert any(c["id"] == cat_id for c in list_resp.json())

    del_resp = await client.delete(f"/api/v1/masters/categories/{cat_id}", headers=h)
    assert del_resp.status_code == 204


async def test_update_category(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    create = await client.post("/api/v1/masters/categories", json={"name": "OldName"}, headers=h)
    cat_id = create.json()["id"]

    update = await client.put(f"/api/v1/masters/categories/{cat_id}",
                               json={"name": "NewName", "gxp_applicable": "yes"}, headers=h)
    assert update.status_code == 200
    assert update.json()["name"] == "NewName"
    assert update.json()["gxp_applicable"] == "yes"

    await client.delete(f"/api/v1/masters/categories/{cat_id}", headers=h)


async def test_delete_nonexistent_category_returns_404(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.delete("/api/v1/masters/categories/00000000-0000-0000-0000-000000000000", headers=h)
    assert resp.status_code == 404


async def test_create_sub_category(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    cat = (await client.post("/api/v1/masters/categories", json={"name": "ParentCat"}, headers=h)).json()
    cat_id = cat["id"]

    sub = await client.post("/api/v1/masters/sub-categories",
                             json={"category_id": cat_id, "name": "SubOne"}, headers=h)
    assert sub.status_code == 201
    assert sub.json()["name"] == "SubOne"
    sub_id = sub.json()["id"]

    await client.delete(f"/api/v1/masters/sub-categories/{sub_id}", headers=h)
    await client.delete(f"/api/v1/masters/categories/{cat_id}", headers=h)


async def test_create_list_delete_vendor(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post("/api/v1/masters/vendors",
                             json={"name": "TempVendor", "audit_risk": "MEDIUM"}, headers=h)
    assert resp.status_code == 201
    vid = resp.json()["id"]

    vendors = (await client.get("/api/v1/masters/vendors")).json()
    assert any(v["id"] == vid for v in vendors)

    await client.delete(f"/api/v1/masters/vendors/{vid}", headers=h)


async def test_create_metric(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post("/api/v1/masters/metrics",
                             json={"name": "Per Capsule", "description": "For clinical"}, headers=h)
    assert resp.status_code == 201
    mid = resp.json()["id"]
    await client.delete(f"/api/v1/masters/metrics/{mid}", headers=h)


async def test_create_discovery_source(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post("/api/v1/masters/discovery-sources",
                             json={"name": "Jamf Pro", "type": "agent", "status": "active"}, headers=h)
    assert resp.status_code == 201
    sid = resp.json()["id"]
    await client.delete(f"/api/v1/masters/discovery-sources/{sid}", headers=h)


async def test_create_usage_method(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post("/api/v1/masters/usage-methods",
                             json={"name": "API Auto-Sync", "template_required": "none"}, headers=h)
    assert resp.status_code == 201
    mid = resp.json()["id"]
    await client.delete(f"/api/v1/masters/usage-methods/{mid}", headers=h)


async def test_create_region(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post("/api/v1/masters/regions",
                             json={"name": "APAC", "regulatory_zone": "Various"}, headers=h)
    assert resp.status_code == 201
    rid = resp.json()["id"]
    await client.delete(f"/api/v1/masters/regions/{rid}", headers=h)


async def test_all_masters_aggregates_all_tables(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    await client.post("/api/v1/masters/vendors", json={"name": "AggVendor"}, headers=h)
    all_resp = await client.get("/api/v1/masters/all")
    assert all_resp.status_code == 200
    data = all_resp.json()
    assert any(v["name"] == "AggVendor" for v in data["vendors"])
    vid = next(v["id"] for v in data["vendors"] if v["name"] == "AggVendor")
    await client.delete(f"/api/v1/masters/vendors/{vid}", headers=h)
