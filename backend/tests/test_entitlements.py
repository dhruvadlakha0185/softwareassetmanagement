import io
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.models.contracts import Entitlement


@pytest.fixture
async def sample_entitlement(db, admin_token, client):
    """Creates one entitlement via the publish endpoint."""
    h = {"Authorization": f"Bearer {admin_token}"}
    result = (await client.post("/api/v1/onboarding/publish", json={
        "canonical_name": "EntTest Software",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
        "line_items": [{"contract_name": "EntTest Sub", "license_type": "subscription", "entitled_count": 200}],
    }, headers=h)).json()
    ent_id = result["ent_ids"][0]
    yield ent_id
    # No cleanup — contracts FK prevents SW delete; test DB drops at session end


async def test_list_entitlements_returns_list(client):
    resp = await client.get("/api/v1/entitlements")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_get_entitlement(client, sample_entitlement):
    resp = await client.get(f"/api/v1/entitlements/{sample_entitlement}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ent_id"] == sample_entitlement
    assert data["entitled_count"] == 200


async def test_update_entitlement_requires_admin(client, sample_entitlement):
    resp = await client.put(f"/api/v1/entitlements/{sample_entitlement}", json={"in_use_count": 50})
    assert resp.status_code in (401, 403)


async def test_update_entitlement(client, admin_token, sample_entitlement):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.put(
        f"/api/v1/entitlements/{sample_entitlement}",
        json={"in_use_count": 75, "status": "OK"},
        headers=h,
    )
    assert resp.status_code == 200
    assert resp.json()["in_use_count"] == 75
    assert resp.json()["status"] == "OK"


async def test_list_filter_by_sw_id(client, sample_entitlement):
    ent = (await client.get(f"/api/v1/entitlements/{sample_entitlement}")).json()
    sw_id = ent["sw_id"]
    resp = await client.get(f"/api/v1/entitlements?sw_id={sw_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert all(e["sw_id"] == sw_id for e in data)


async def test_template_download(client):
    resp = await client.get("/api/v1/entitlements/template")
    assert resp.status_code == 200
    assert "spreadsheet" in resp.headers["content-type"]
    assert len(resp.content) > 100


async def test_upload_tab_b_updates_in_use(client, admin_token, sample_entitlement):
    from app.services.uploads.xlsx_processor import generate_template

    h = {"Authorization": f"Bearer {admin_token}"}
    ent_resp = (await client.get(f"/api/v1/entitlements/{sample_entitlement}")).json()
    rows = [{
        "ent_id": sample_entitlement,
        "sw_id": ent_resp["sw_id"],
        "canonical_name": "EntTest Software",
        "contract_name": "EntTest Sub",
        "license_type": "subscription",
        "metric_name": "",
        "entitled_count": 200,
        "in_use_count": 42,
        "unit_cost_inr": None,
        "annual_cost_inr": None,
        "notes": None,
    }]
    xlsx_bytes = generate_template(rows)

    with patch("app.api.v1.routes.entitlements.get_storage_backend") as mock_storage:
        mock_backend = MagicMock()
        mock_backend.upload = AsyncMock(return_value="test/path.xlsx")
        mock_storage.return_value = mock_backend

        resp = await client.post(
            "/api/v1/entitlements/upload",
            files={"file": ("usage.xlsx", io.BytesIO(xlsx_bytes),
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            headers=h,
        )

    assert resp.status_code == 201
    data = resp.json()
    assert data["tab_b_updated"] >= 1

    updated = (await client.get(f"/api/v1/entitlements/{sample_entitlement}")).json()
    assert updated["in_use_count"] == 42
