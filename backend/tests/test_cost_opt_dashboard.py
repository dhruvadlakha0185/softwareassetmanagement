import pytest
from unittest.mock import patch, AsyncMock


async def test_scorecard_requires_auth(client):
    resp = await client.get("/api/v1/cost-optimisation/scorecard")
    assert resp.status_code in (401, 403)


async def test_scorecard_returns_scorecard(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/cost-optimisation/scorecard", headers=h)
    assert resp.status_code == 200
    data = resp.json()
    assert "total_est_saving_inr" in data
    assert "items" in data
    assert isinstance(data["items"], list)


async def test_scorecard_shows_under_utilised(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    # Create an under-utilised entitlement
    publish = (await client.post("/api/v1/onboarding/publish", json={
        "canonical_name": "CostOpt Test SW",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
        "line_items": [{"contract_name": "CostOpt Sub", "license_type": "subscription",
                        "entitled_count": 100, "unit_cost_inr": 1000}],
    }, headers=h)).json()
    ent_id = publish["ent_ids"][0]

    # Set low in-use and run reconciliation to update status
    await client.put(f"/api/v1/entitlements/{ent_id}", json={"in_use_count": 20}, headers=h)
    with patch("app.services.reconciliation_engine.get_recommendations", new_callable=AsyncMock) as m:
        m.return_value = {}
        await client.post("/api/v1/reconciliation/run", headers=h)

    resp = await client.get("/api/v1/cost-optimisation/scorecard", headers=h)
    data = resp.json()
    our_item = next((i for i in data["items"] if i["ent_id"] == ent_id), None)
    assert our_item is not None
    assert our_item["status"] == "UNDER_UTILISED"
    assert our_item["est_annual_saving_inr"] > 0
    assert our_item["action"] == "RIGHT-SIZE"


async def test_dashboard_summary_requires_auth(client):
    resp = await client.get("/api/v1/dashboard/summary")
    assert resp.status_code in (401, 403)


async def test_dashboard_summary(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/dashboard/summary", headers=h)
    assert resp.status_code == 200
    data = resp.json()
    for key in ("total_sw", "total_entitlements", "total_annual_cost_inr",
                "over_deployed_count", "watch_count", "under_utilised_count",
                "expiring_30d_count", "unread_alerts_count",
                "total_discovery_records", "matched_discovery_count"):
        assert key in data, f"Missing key: {key}"
    assert data["total_sw"] >= 0
    assert data["total_entitlements"] >= 0
