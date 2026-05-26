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
