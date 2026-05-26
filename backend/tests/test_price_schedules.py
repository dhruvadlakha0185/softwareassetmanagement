import pytest
from sqlalchemy import select
from app.models.contracts import EntitlementPriceSchedule


from datetime import date as dt
from app.schemas.onboarding import MultiLineItemIn, PriceScheduleIn
from app.schemas.entitlements import PriceScheduleOut
import uuid


@pytest.mark.asyncio
async def test_price_schedule_table_exists(db):
    """Verify the table is reachable and the model maps correctly."""
    result = await db.execute(select(EntitlementPriceSchedule))
    assert result.scalars().all() == []


def test_multi_line_item_accepts_price_schedule():
    item = MultiLineItemIn(
        contract_name="MS 365 E3",
        primary_sw_name="Microsoft 365 E3",
        price_schedule=[
            PriceScheduleIn(
                year_number=1,
                effective_from=dt(2026, 1, 26),
                effective_to=dt(2027, 1, 25),
                entitled_count=500,
                unit_cost=3600,
                annual_cost=1800000,
            ),
            PriceScheduleIn(
                year_number=2,
                effective_from=dt(2027, 1, 26),
                effective_to=dt(2028, 1, 25),
                entitled_count=550,
                unit_cost=3800,
                annual_cost=2090000,
            ),
        ],
    )
    assert len(item.price_schedule) == 2
    assert item.price_schedule[1].unit_cost == 3800


def test_multi_line_item_no_schedule_defaults_empty():
    item = MultiLineItemIn(
        contract_name="Oracle DB",
        primary_sw_name="Oracle Database",
    )
    assert item.price_schedule == []


async def _seed_catalog_masters(db):
    """Minimal masters needed for multi_publish."""
    import uuid as _uuid
    from app.models.masters import Category, SubCategory
    cat = Category(id=_uuid.uuid4(), name="Productivity Test")
    sub = SubCategory(id=_uuid.uuid4(), name="Office Suite Test", category_id=cat.id)
    db.add_all([cat, sub])
    await db.flush()
    return cat, sub


@pytest.mark.asyncio
async def test_multi_publish_creates_price_schedules(client, admin_token, db):
    cat, sub = await _seed_catalog_masters(db)
    await db.commit()

    payload = {
        "vendor_name": "Microsoft",
        "po_number": "PO-SCHED-TEST-001",
        "start_date": "2026-01-26",
        "end_date": "2029-01-26",
        "line_items": [
            {
                "contract_name": "MS 365 E3 Sched Test",
                "primary_sw_name": "Microsoft 365 E3 Sched Test",
                "entitled_count": 500,
                "unit_cost": 3600,
                "annual_cost": 1800000,
                "deployment": "cloud",
                "gxp_flag": "no",
                "category_id": str(cat.id),
                "sub_category_id": str(sub.id),
                "price_schedule": [
                    {
                        "year_number": 1,
                        "effective_from": "2026-01-26",
                        "effective_to": "2027-01-25",
                        "entitled_count": 500,
                        "unit_cost": 3600,
                        "annual_cost": 1800000,
                    },
                    {
                        "year_number": 2,
                        "effective_from": "2027-01-26",
                        "effective_to": "2028-01-25",
                        "entitled_count": 550,
                        "unit_cost": 3800,
                        "annual_cost": 2090000,
                    },
                    {
                        "year_number": 3,
                        "effective_from": "2028-01-26",
                        "effective_to": "2029-01-25",
                        "entitled_count": 600,
                        "unit_cost": 4000,
                        "annual_cost": 2400000,
                    },
                ],
            }
        ],
    }

    resp = await client.post(
        "/api/v1/onboarding/multi-publish",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert len(data["created"]) == 1
    ent_id = data["created"][0]["ent_id"]

    from sqlalchemy import select
    from app.models.contracts import Entitlement, EntitlementPriceSchedule

    result = await db.execute(
        select(EntitlementPriceSchedule)
        .where(EntitlementPriceSchedule.ent_id == ent_id)
        .order_by(EntitlementPriceSchedule.year_number)
    )
    schedules = result.scalars().all()
    assert len(schedules) == 3, f"Expected 3 schedule rows, got {len(schedules)}"
    assert schedules[0].unit_cost == 3600
    assert schedules[1].unit_cost == 3800
    assert schedules[2].entitled_count == 600

    ent = await db.get(Entitlement, ent_id)
    assert ent.unit_cost == 3600
    assert ent.entitled_count == 500
