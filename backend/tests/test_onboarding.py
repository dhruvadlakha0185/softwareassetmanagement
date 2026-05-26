import io
import pytest
from unittest.mock import AsyncMock, patch
from app.models.contracts import EntitlementDoaContact

MOCK_EXTRACTION = {
    "vendor_name": "Microsoft Corporation",
    "po_number": "PO-2024-001",
    "clm_id": None,
    "start_date": "2024-04-01",
    "end_date": "2025-03-31",
    "auto_renewal_clause": "yes",
    "total_value_inr": 5000000,
    "reseller": None,
    "line_items": [
        {
            "contract_name": "Microsoft 365 E3",
            "metric": "Per User",
            "license_type": "subscription",
            "entitled_count": 500,
            "unit_cost_inr": 10000,
            "annual_cost_inr": 5000000,
        }
    ],
}


async def test_extract_requires_auth(client):
    resp = await client.post(
        "/api/v1/onboarding/extract",
        files={"file": ("test.pdf", io.BytesIO(b"%PDF-1.4 test"), "application/pdf")},
    )
    assert resp.status_code in (401, 403)


async def test_extract_returns_json(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    with patch("app.api.v1.routes.onboarding.call_openai", new_callable=AsyncMock) as mock_ai, \
         patch("app.api.v1.routes.onboarding.extract_contract_text", return_value="contract text"):
        mock_ai.return_value = MOCK_EXTRACTION
        resp = await client.post(
            "/api/v1/onboarding/extract",
            files={"file": ("contract.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
            headers=h,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["po_number"] == "PO-2024-001"
    assert len(data["line_items"]) == 1


async def test_draft_lifecycle(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}

    # create
    create = await client.post(
        "/api/v1/onboarding/drafts",
        json={"po_number": "PO-DRAFT-01", "current_step": 2},
        headers=h,
    )
    assert create.status_code == 201
    draft_id = create.json()["id"]

    # get
    get_resp = await client.get(f"/api/v1/onboarding/drafts/{draft_id}", headers=h)
    assert get_resp.status_code == 200
    assert get_resp.json()["po_number"] == "PO-DRAFT-01"

    # update
    update = await client.put(
        f"/api/v1/onboarding/drafts/{draft_id}",
        json={"current_step": 4},
        headers=h,
    )
    assert update.status_code == 200
    assert update.json()["current_step"] == 4

    # list
    drafts = (await client.get("/api/v1/onboarding/drafts", headers=h)).json()
    assert any(d["id"] == draft_id for d in drafts)

    # delete
    del_resp = await client.delete(f"/api/v1/onboarding/drafts/{draft_id}", headers=h)
    assert del_resp.status_code == 204


async def test_publish_creates_sw_contract_entitlement(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "primary_sw_name": "Publish Test Software",
        "publisher": "Pub Corp",
        "gxp_flag": "no",
        "vendor_risk": "LOW",
        "deployment": "cloud",
        "po_number": "PO-PUB-001",
        "start_date": "2024-01-01",
        "end_date": "2025-01-01",
        "line_items": [
            {
                "contract_name": "Publish Test E3",
                "metric": "Per User",
                "license_type": "subscription",
                "entitled_count": 100,
                "unit_cost_inr": 1000,
                "annual_cost_inr": 100000,
            }
        ],
        "aliases": ["PubTest", "PT Software"],
    }
    resp = await client.post("/api/v1/onboarding/publish", json=payload, headers=h)
    assert resp.status_code == 201
    data = resp.json()
    assert data["sw_id"].startswith("SW-")
    assert len(data["ent_ids"]) == 1
    assert data["ent_ids"][0].startswith("ENT-")

    # Verify SW entry exists with aliases
    catalog_entry = (await client.get(f"/api/v1/catalog/{data['sw_id']}")).json()
    assert catalog_entry["primary_sw_name"] == "Publish Test Software"
    alias_names = [a["alias_name"] for a in catalog_entry["aliases"]]
    assert "PubTest" in alias_names
    # No cleanup needed — contracts FK prevents catalog delete; test DB drops all at session end


async def test_publish_maps_to_existing_sw(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    # create SW first
    sw = (await client.post("/api/v1/catalog", json={
        "primary_sw_name": "Existing SW For Publish",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
    }, headers=h)).json()
    sw_id = sw["sw_id"]

    payload = {
        "primary_sw_name": "Existing SW For Publish",
        "sw_id": sw_id,
        "line_items": [
            {"contract_name": "Existing SW Sub", "license_type": "subscription", "entitled_count": 50}
        ],
    }
    resp = await client.post("/api/v1/onboarding/publish", json=payload, headers=h)
    assert resp.status_code == 201
    assert resp.json()["sw_id"] == sw_id
    # No cleanup — contracts FK prevents catalog delete; test DB drops all at session end


def test_entitlement_doa_contact_model_has_expected_columns():
    cols = {c.key for c in EntitlementDoaContact.__table__.columns}
    assert {"id", "ent_id", "doa_contact_id"}.issubset(cols)
