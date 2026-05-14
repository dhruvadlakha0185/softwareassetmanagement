import pytest
from sqlalchemy import select
from app.models.alerts import Alert


@pytest.fixture
async def sample_alert(db, admin_token, client):
    """Create a UTILISATION alert via the alert generator on a high-usage entitlement."""
    h = {"Authorization": f"Bearer {admin_token}"}
    # Create entitlement with high in_use
    publish = (await client.post("/api/v1/onboarding/publish", json={
        "canonical_name": "AlertTest Software",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
        "line_items": [{"contract_name": "AlertTest Sub", "license_type": "subscription", "entitled_count": 100}],
    }, headers=h)).json()
    ent_id = publish["ent_ids"][0]
    await client.put(f"/api/v1/entitlements/{ent_id}", json={"in_use_count": 110}, headers=h)

    from app.services.alert_generator import generate_alerts
    count = await generate_alerts(db)
    assert count >= 1

    result = await db.execute(
        select(Alert).where(Alert.ent_id == ent_id, Alert.alert_type == "UTILISATION")
    )
    alert = result.scalar_one_or_none()
    assert alert is not None
    yield alert


async def test_list_alerts_requires_auth(client):
    resp = await client.get("/api/v1/alerts")
    assert resp.status_code in (401, 403)


async def test_list_alerts(client, admin_token, sample_alert):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/alerts", headers=h)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) >= 1


async def test_alert_has_expected_fields(client, admin_token, sample_alert):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/alerts", headers=h)
    alert = next(a for a in resp.json() if a["id"] == str(sample_alert.id))
    assert alert["alert_type"] == "UTILISATION"
    assert alert["severity"] in ("HIGH", "MEDIUM")
    assert "title" in alert
    assert alert["is_read"] is False


async def test_mark_alert_read(client, admin_token, sample_alert):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post(f"/api/v1/alerts/{sample_alert.id}/read", headers=h)
    assert resp.status_code == 204

    # Appears as read in list
    alerts = (await client.get("/api/v1/alerts", headers=h)).json()
    alert = next(a for a in alerts if a["id"] == str(sample_alert.id))
    assert alert["is_read"] is True


async def test_alert_counts(client, admin_token, sample_alert):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/alerts/counts", headers=h)
    assert resp.status_code == 200
    data = resp.json()
    assert "total_unread" in data
    assert "critical" in data
    assert data["total_unread"] >= 1


async def test_alert_filter_by_type(client, admin_token, sample_alert):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/alerts?alert_type=UTILISATION", headers=h)
    assert resp.status_code == 200
    assert all(a["alert_type"] == "UTILISATION" for a in resp.json())


async def test_dedup_no_duplicate_alerts_same_day(db, admin_token, client):
    """Calling generate_alerts twice on the same day should not create duplicates."""
    h = {"Authorization": f"Bearer {admin_token}"}
    publish = (await client.post("/api/v1/onboarding/publish", json={
        "canonical_name": "DedupTest Software",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
        "line_items": [{"contract_name": "DedupTest Sub", "license_type": "subscription", "entitled_count": 100}],
    }, headers=h)).json()
    ent_id = publish["ent_ids"][0]
    await client.put(f"/api/v1/entitlements/{ent_id}", json={"in_use_count": 110}, headers=h)

    from app.services.alert_generator import generate_alerts

    await generate_alerts(db)
    await generate_alerts(db)

    # Should have exactly one UTILISATION alert for this entitlement today
    result = await db.execute(
        select(Alert).where(Alert.ent_id == ent_id, Alert.alert_type == "UTILISATION")
    )
    util_alerts = result.scalars().all()
    assert len(util_alerts) == 1
