import pytest
from unittest.mock import patch, AsyncMock


async def test_run_reconciliation_requires_admin(client):
    resp = await client.post("/api/v1/reconciliation/run")
    assert resp.status_code in (401, 403)


async def test_run_reconciliation(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    with patch("app.services.reconciliation_engine.get_recommendations", new_callable=AsyncMock) as mock_ai:
        mock_ai.return_value = {}
        resp = await client.post("/api/v1/reconciliation/run", headers=h)
    assert resp.status_code == 201
    data = resp.json()
    assert "run" in data
    assert "results" in data
    assert data["run"]["entitlements_processed"] >= 0


async def test_list_runs(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    with patch("app.services.reconciliation_engine.get_recommendations", new_callable=AsyncMock) as mock_ai:
        mock_ai.return_value = {}
        await client.post("/api/v1/reconciliation/run", headers=h)

    resp = await client.get("/api/v1/reconciliation/results")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) >= 1


async def test_latest_run(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    with patch("app.services.reconciliation_engine.get_recommendations", new_callable=AsyncMock) as mock_ai:
        mock_ai.return_value = {}
        create_resp = await client.post("/api/v1/reconciliation/run", headers=h)
    run_id = create_resp.json()["run"]["id"]

    resp = await client.get("/api/v1/reconciliation/results/latest")
    assert resp.status_code == 200
    assert resp.json()["run"]["id"] == run_id


async def test_recon_computes_status(client, admin_token):
    """Verify that an over-deployed entitlement gets OVER_DEPLOYED status."""
    h = {"Authorization": f"Bearer {admin_token}"}

    # Create an entitlement with in_use > entitled
    publish = (await client.post("/api/v1/onboarding/publish", json={
        "canonical_name": "ReconTest Software",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
        "line_items": [{"contract_name": "ReconTest Sub", "license_type": "subscription", "entitled_count": 50}],
    }, headers=h)).json()
    ent_id = publish["ent_ids"][0]

    # Update in_use > entitled (over-deployed)
    await client.put(f"/api/v1/entitlements/{ent_id}", json={"in_use_count": 75}, headers=h)

    with patch("app.services.reconciliation_engine.get_recommendations", new_callable=AsyncMock) as mock_ai:
        mock_ai.return_value = {ent_id: "Consider purchasing additional licenses."}
        resp = await client.post("/api/v1/reconciliation/run", headers=h)

    assert resp.status_code == 201
    results = resp.json()["results"]
    our_result = next((r for r in results if r["ent_id"] == ent_id), None)
    assert our_result is not None
    assert our_result["status"] == "OVER_DEPLOYED"
    assert our_result["ai_recommendation"] == "Consider purchasing additional licenses."

    # Verify Entitlement.status was updated
    ent = (await client.get(f"/api/v1/entitlements/{ent_id}")).json()
    assert ent["status"] == "OVER_DEPLOYED"
