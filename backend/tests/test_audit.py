import pytest
from unittest.mock import patch, AsyncMock


async def test_list_audit_requires_auth(client):
    resp = await client.get("/api/v1/audit")
    assert resp.status_code in (401, 403)


async def test_list_audit_returns_list(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/audit", headers=h)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_catalog_create_produces_audit_entry(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post("/api/v1/catalog", json={
        "canonical_name": "Audit Test SW",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
    }, headers=h)
    assert resp.status_code == 201
    sw_id = resp.json()["sw_id"]

    audit = (await client.get(f"/api/v1/audit?sw_id={sw_id}", headers=h)).json()
    assert any(a["action_type"] == "CATALOG_CREATED" for a in audit)

    # cleanup
    await client.delete(f"/api/v1/catalog/{sw_id}", headers=h)


async def test_audit_filter_by_entity_type(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/audit?entity_type=software_catalog", headers=h)
    assert resp.status_code == 200
    for entry in resp.json():
        assert entry["entity_type"] == "software_catalog"


async def test_audit_export_returns_xlsx(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/audit/export", headers=h)
    assert resp.status_code == 200
    assert "spreadsheet" in resp.headers["content-type"]
    assert len(resp.content) > 100


async def test_recon_run_produces_audit_entry(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    with patch("app.services.reconciliation_engine.get_recommendations", new_callable=AsyncMock) as mock_ai:
        mock_ai.return_value = {}
        await client.post("/api/v1/reconciliation/run", headers=h)

    audit = (await client.get("/api/v1/audit?entity_type=reconciliation_run", headers=h)).json()
    assert any(a["action_type"] == "RECONCILIATION_RUN" for a in audit)
