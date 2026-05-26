import pytest
import uuid
from datetime import date
from unittest.mock import patch, AsyncMock
from app.models.catalog import SoftwareCatalog
from app.models.contracts import Contract, Entitlement, EntitlementPriceSchedule


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
        "primary_sw_name": "CostOpt Test SW",
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


async def test_dashboard_total_committed_value(client, admin_token, db):
    """total_committed_value_inr sums all schedule rows + unscheduled entitlements."""
    h = {"Authorization": f"Bearer {admin_token}"}

    # ── Entitlement A: single-year, NO price schedule rows ────────────────────
    sw_a = SoftwareCatalog(
        sw_id="TST-CV1",
        primary_sw_name="CommValue SW Alpha",
        gxp_flag="no",
        vendor_risk="LOW",
        deployment="cloud",
    )
    db.add(sw_a)
    await db.flush()

    contract_a = Contract(
        sw_id="TST-CV1",
        storage_backend="local",
    )
    db.add(contract_a)
    await db.flush()

    ent_a = Entitlement(
        ent_id="ENT-CV1",
        sw_id="TST-CV1",
        contract_id=contract_a.id,
        contract_name="Alpha Sub",
        annual_cost=1_000_000,
        status="ACTIVE",
    )
    db.add(ent_a)
    await db.flush()

    # ── Entitlement B: multi-year, HAS 3 price schedule rows ─────────────────
    sw_b = SoftwareCatalog(
        sw_id="TST-CV2",
        primary_sw_name="CommValue SW Beta",
        gxp_flag="no",
        vendor_risk="LOW",
        deployment="cloud",
    )
    db.add(sw_b)
    await db.flush()

    contract_b = Contract(
        sw_id="TST-CV2",
        storage_backend="local",
    )
    db.add(contract_b)
    await db.flush()

    ent_b = Entitlement(
        ent_id="ENT-CV2",
        sw_id="TST-CV2",
        contract_id=contract_b.id,
        contract_name="Beta Multi-Year",
        annual_cost=500_000,
        status="ACTIVE",
    )
    db.add(ent_b)
    await db.flush()

    for year_num, ann_cost in enumerate([(500_000), (600_000), (700_000)], start=1):
        sched = EntitlementPriceSchedule(
            id=uuid.uuid4(),
            ent_id="ENT-CV2",
            year_number=year_num,
            effective_from=date(2024 + year_num - 1, 4, 1),
            effective_to=date(2024 + year_num, 3, 31),
            entitled_count=100,
            unit_cost=ann_cost // 100,
            annual_cost=ann_cost,
        )
        db.add(sched)

    await db.commit()

    # ── Call the dashboard summary endpoint ───────────────────────────────────
    resp = await client.get("/api/v1/dashboard/summary", headers=h)
    assert resp.status_code == 200
    data = resp.json()

    # total_committed_value_inr must be present
    assert "total_committed_value_inr" in data, "Missing field: total_committed_value_inr"

    # Expected = 1_000_000 (ent_a, no schedule) + 500_000 + 600_000 + 700_000 (schedule rows)
    assert data["total_committed_value_inr"] == 2_800_000
