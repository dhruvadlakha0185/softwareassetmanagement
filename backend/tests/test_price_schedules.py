import pytest
from sqlalchemy import select
from app.models.contracts import EntitlementPriceSchedule


@pytest.mark.asyncio
async def test_price_schedule_table_exists(db):
    """Verify the table is reachable and the model maps correctly."""
    result = await db.execute(select(EntitlementPriceSchedule))
    assert result.scalars().all() == []
