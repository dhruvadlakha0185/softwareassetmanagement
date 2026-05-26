# Multi-Year Contract Price Schedules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store per-year pricing schedules on entitlements so that a 3-year contract with escalating seat counts and unit costs is captured, the active year's pricing is automatically surfaced in dashboards/reconciliation/cost-optimisation, and DOA contacts receive an alert before each year-boundary price change.

**Architecture:** A new `entitlement_price_schedules` table holds one row per contract year per entitlement. A nightly sync job (added to the existing `alert_generator.py` pass) writes the currently-active year's `unit_cost`, `annual_cost`, and `entitled_count` back onto the `Entitlement` row — so every existing consumer continues reading those three columns unchanged. The onboarding Step 3 UI auto-generates year rows from the contract date span and lets users edit per-year figures.

**Tech Stack:** Python 3.11 / FastAPI / SQLAlchemy async / Alembic / PostgreSQL — React 18 / Vite frontend (no separate test runner; frontend steps use browser verification). Backend tests use `pytest-asyncio` + `httpx.AsyncClient` against a local Postgres test DB (`postgresql+asyncpg://postgres:postgres@localhost:54322/drl_sam_test`).

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `backend/alembic/versions/013_entitlement_price_schedules.py` | Create | Migration: new table + extend alert_type_enum |
| `backend/app/models/contracts.py` | Modify | Add `EntitlementPriceSchedule` SQLAlchemy model |
| `backend/app/models/__init__.py` | Modify | Export `EntitlementPriceSchedule` |
| `backend/app/schemas/onboarding.py` | Modify | Add `PriceScheduleIn`; update `MultiLineItemIn` |
| `backend/app/schemas/entitlements.py` | Modify | Add `PriceScheduleOut` |
| `backend/app/schemas/dashboard.py` | Modify | Add `total_committed_value_inr` field |
| `backend/app/api/v1/routes/onboarding.py` | Modify | Bulk-insert schedule rows in `multi_publish` |
| `backend/app/api/v1/routes/dashboard.py` | Modify | Compute `total_committed_value_inr` |
| `backend/app/services/alert_generator.py` | Modify | Add `sync_active_pricing` + `generate_price_change_alerts` |
| `backend/tests/test_price_schedules.py` | Create | Backend tests for schedule storage, sync, alerts |
| `frontend/src/pages/Onboarding/OnboardingPage.jsx` | Modify | Add `PriceScheduleTable` component; wire year-row generation |

---

## Task 1: Migration — `entitlement_price_schedules` table + enum extension

**Files:**
- Create: `backend/alembic/versions/013_entitlement_price_schedules.py`

- [ ] **Step 1: Write the migration file**

```python
"""Add entitlement_price_schedules table and PRICE_YEAR_CHANGE alert type

Revision ID: 013
Revises: 012
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade():
    # Extend alert_type_enum (PostgreSQL supports ADD VALUE without full recreate)
    op.execute("ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'PRICE_YEAR_CHANGE'")

    op.create_table(
        "entitlement_price_schedules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("ent_id", sa.String(20), sa.ForeignKey("entitlements.ent_id", ondelete="CASCADE"), nullable=False),
        sa.Column("year_number", sa.Integer, nullable=False),
        sa.Column("effective_from", sa.Date, nullable=False),
        sa.Column("effective_to", sa.Date, nullable=False),
        sa.Column("entitled_count", sa.BigInteger, nullable=False),
        sa.Column("unit_cost", sa.BigInteger, nullable=False),
        sa.Column("annual_cost", sa.BigInteger, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("now()")),
        sa.UniqueConstraint("ent_id", "year_number", name="uq_ent_year"),
    )
    op.create_index(
        "ix_eps_ent_dates",
        "entitlement_price_schedules",
        ["ent_id", "effective_from", "effective_to"],
    )


def downgrade():
    op.drop_index("ix_eps_ent_dates", table_name="entitlement_price_schedules")
    op.drop_table("entitlement_price_schedules")
    # Note: PostgreSQL does not support removing enum values; downgrade leaves the enum value in place
```

- [ ] **Step 2: Run migration**

```bash
cd backend
alembic upgrade 013
```

Expected: `Running upgrade 012 -> 013, Add entitlement_price_schedules table...`

- [ ] **Step 3: Verify table exists**

```bash
psql $DATABASE_URL -c "\d entitlement_price_schedules"
```

Expected: table listed with columns `id, ent_id, year_number, effective_from, effective_to, entitled_count, unit_cost, annual_cost, created_at`.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/013_entitlement_price_schedules.py
git commit -m "feat: migration 013 — entitlement_price_schedules table + PRICE_YEAR_CHANGE alert type"
```

---

## Task 2: SQLAlchemy Model + Export

**Files:**
- Modify: `backend/app/models/contracts.py` (after line 67, before `OnboardingDraft`)
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Add `EntitlementPriceSchedule` model to `contracts.py`**

Add after the closing of the `Entitlement` class (after line 66, before `class OnboardingDraft`):

```python
class EntitlementPriceSchedule(Base):
    __tablename__ = "entitlement_price_schedules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ent_id = Column(String(20), ForeignKey("entitlements.ent_id", ondelete="CASCADE"), nullable=False)
    year_number = Column(Integer, nullable=False)
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date, nullable=False)
    entitled_count = Column(BigInteger, nullable=False)
    unit_cost = Column(BigInteger, nullable=False)
    annual_cost = Column(BigInteger, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 2: Add `Date` to the imports in `contracts.py`**

The existing import line is:
```python
from sqlalchemy import Column, String, Boolean, DateTime, Date, ForeignKey, Text, BigInteger, Integer, Enum as SAEnum
```

`Date` is already imported — no change needed.

- [ ] **Step 3: Export from `models/__init__.py`**

Change the contracts import line from:
```python
from app.models.contracts import Contract, Entitlement, OnboardingDraft
```
to:
```python
from app.models.contracts import Contract, Entitlement, OnboardingDraft, EntitlementPriceSchedule
```

Add `"EntitlementPriceSchedule"` to `__all__`.

- [ ] **Step 4: Write a quick model smoke test**

Create `backend/tests/test_price_schedules.py`:

```python
import pytest
import uuid
from datetime import date
from sqlalchemy import select
from app.models.contracts import EntitlementPriceSchedule


async def test_price_schedule_table_exists(db):
    """Verify the table is reachable and the model maps correctly."""
    result = await db.execute(select(EntitlementPriceSchedule))
    assert result.scalars().all() == []
```

- [ ] **Step 5: Run the test**

```bash
cd backend
pytest tests/test_price_schedules.py::test_price_schedule_table_exists -v
```

Expected: `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/contracts.py backend/app/models/__init__.py backend/tests/test_price_schedules.py
git commit -m "feat: add EntitlementPriceSchedule model and export"
```

---

## Task 3: Pydantic Schemas

**Files:**
- Modify: `backend/app/schemas/onboarding.py`
- Modify: `backend/app/schemas/entitlements.py`

- [ ] **Step 1: Add `PriceScheduleIn` to `onboarding.py`**

Add before the `MultiLineItemIn` class:

```python
class PriceScheduleIn(BaseModel):
    year_number: int
    effective_from: date
    effective_to: date
    entitled_count: int
    unit_cost: int
    annual_cost: int
```

- [ ] **Step 2: Add `price_schedule` field to `MultiLineItemIn`**

Add at the end of `MultiLineItemIn`:

```python
    price_schedule: list[PriceScheduleIn] = []
```

- [ ] **Step 3: Add `PriceScheduleOut` to `entitlements.py`**

Add at the end of `entitlements.py`:

```python
class PriceScheduleOut(BaseModel):
    id: UUID
    ent_id: str
    year_number: int
    effective_from: date
    effective_to: date
    entitled_count: int
    unit_cost: int
    annual_cost: int
    model_config = {"from_attributes": True}
```

Also add `from datetime import date` at the top of `entitlements.py` if not already present.

- [ ] **Step 4: Write schema validation test**

Add to `backend/tests/test_price_schedules.py`:

```python
from datetime import date as dt
from app.schemas.onboarding import MultiLineItemIn, PriceScheduleIn
from app.schemas.entitlements import PriceScheduleOut
import uuid


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
```

- [ ] **Step 5: Run the tests**

```bash
cd backend
pytest tests/test_price_schedules.py -v -k "schema"
```

Wait — the above tests are not async (they don't use `db`), so run:

```bash
pytest tests/test_price_schedules.py::test_multi_line_item_accepts_price_schedule tests/test_price_schedules.py::test_multi_line_item_no_schedule_defaults_empty -v
```

Expected: both `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/onboarding.py backend/app/schemas/entitlements.py backend/tests/test_price_schedules.py
git commit -m "feat: add PriceScheduleIn/Out schemas and wire into MultiLineItemIn"
```

---

## Task 4: multi_publish — Insert Schedule Rows

**Files:**
- Modify: `backend/app/api/v1/routes/onboarding.py`

The entitlement creation block ends at `await db.flush()` on line ~428. Insert schedule rows immediately after.

- [ ] **Step 1: Add import for `EntitlementPriceSchedule` and `PriceScheduleIn`**

Add to the imports at the top of `onboarding.py`:

```python
from app.models.contracts import Contract, Entitlement, OnboardingDraft, EntitlementPriceSchedule
```

`PriceScheduleIn` is already imported via the schemas import block — no change needed there.

- [ ] **Step 2: Insert schedule rows after `await db.flush()`**

Find the block that starts with `ent = Entitlement(` in `multi_publish` (around line 407). After `await db.flush()` and before `created.append(...)`, add:

```python
            # ── Insert price schedule rows (multi-year contracts) ─────────
            if item.price_schedule:
                yr1 = next((s for s in item.price_schedule if s.year_number == 1), None)
                if yr1:
                    ent.unit_cost = yr1.unit_cost
                    ent.annual_cost = yr1.annual_cost
                    ent.entitled_count = yr1.entitled_count
                for sched in item.price_schedule:
                    db.add(EntitlementPriceSchedule(
                        ent_id=ent_id,
                        year_number=sched.year_number,
                        effective_from=sched.effective_from,
                        effective_to=sched.effective_to,
                        entitled_count=sched.entitled_count,
                        unit_cost=sched.unit_cost,
                        annual_cost=sched.annual_cost,
                    ))
```

- [ ] **Step 3: Write the integration test**

Add to `backend/tests/test_price_schedules.py`:

```python
import pytest
from unittest.mock import AsyncMock, patch
from sqlalchemy import select
from app.models.contracts import Entitlement, EntitlementPriceSchedule
from app.models.catalog import SoftwareCatalog
from app.models.masters import LicenseMetric, Category, SubCategory


async def _seed_masters(db):
    """Insert minimum master data required for multi_publish."""
    from app.models.masters import Vendor
    import uuid as _uuid
    cat = Category(id=_uuid.uuid4(), name="Productivity")
    sub = SubCategory(id=_uuid.uuid4(), name="Office Suite", category_id=cat.id)
    db.add_all([cat, sub])
    await db.flush()
    return cat, sub


async def test_multi_publish_creates_price_schedules(client, admin_token, db):
    cat, sub = await _seed_masters(db)
    await db.commit()

    payload = {
        "vendor_name": "Microsoft",
        "po_number": "PO-TEST-001",
        "start_date": "2026-01-26",
        "end_date": "2029-01-26",
        "line_items": [
            {
                "contract_name": "MS 365 E3 Test",
                "primary_sw_name": "Microsoft 365 E3 Test",
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
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data["created"]) == 1
    ent_id = data["created"][0]["ent_id"]

    # Verify 3 schedule rows were created
    result = await db.execute(
        select(EntitlementPriceSchedule)
        .where(EntitlementPriceSchedule.ent_id == ent_id)
        .order_by(EntitlementPriceSchedule.year_number)
    )
    schedules = result.scalars().all()
    assert len(schedules) == 3
    assert schedules[0].unit_cost == 3600
    assert schedules[1].unit_cost == 3800
    assert schedules[2].entitled_count == 600

    # Verify entitlement carries Year 1 values
    ent = await db.get(Entitlement, ent_id)
    assert ent.unit_cost == 3600
    assert ent.entitled_count == 500
```

- [ ] **Step 4: Run the test**

```bash
cd backend
pytest tests/test_price_schedules.py::test_multi_publish_creates_price_schedules -v
```

Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/routes/onboarding.py backend/tests/test_price_schedules.py
git commit -m "feat: insert EntitlementPriceSchedule rows in multi_publish"
```

---

## Task 5: Nightly Sync + Price-Change Alerts

**Files:**
- Modify: `backend/app/services/alert_generator.py`

- [ ] **Step 1: Add imports**

Add at the top of `alert_generator.py`:

```python
from sqlalchemy import and_
from app.models.contracts import Entitlement, Contract, EntitlementPriceSchedule
```

Replace the existing import line `from app.models.contracts import Entitlement, Contract`.

- [ ] **Step 2: Add `sync_active_pricing` function**

Add after the existing `_util_severity` helper:

```python
async def sync_active_pricing(db: AsyncSession) -> int:
    """
    For every entitlement with a price schedule, update unit_cost / annual_cost /
    entitled_count to the currently-active year's values.
    Returns the count of entitlements updated.
    """
    today = date.today()
    result = await db.execute(
        select(EntitlementPriceSchedule).where(
            and_(
                EntitlementPriceSchedule.effective_from <= today,
                EntitlementPriceSchedule.effective_to >= today,
            )
        )
    )
    schedules = result.scalars().all()
    synced = 0
    for sched in schedules:
        ent = await db.get(Entitlement, sched.ent_id)
        if not ent:
            continue
        if (
            ent.unit_cost != sched.unit_cost
            or ent.annual_cost != sched.annual_cost
            or ent.entitled_count != sched.entitled_count
        ):
            ent.unit_cost = sched.unit_cost
            ent.annual_cost = sched.annual_cost
            ent.entitled_count = sched.entitled_count
            synced += 1
    return synced
```

- [ ] **Step 3: Add `generate_price_change_alerts` function**

Add after `sync_active_pricing`:

```python
async def generate_price_change_alerts(db: AsyncSession) -> int:
    """
    For each Year-2+ schedule row whose effective_from falls within the contract's
    renewal_alert_extra_days window, emit a PRICE_YEAR_CHANGE alert.
    """
    today = date.today()
    result = await db.execute(
        select(EntitlementPriceSchedule).where(
            EntitlementPriceSchedule.year_number > 1
        )
    )
    future_schedules = result.scalars().all()
    created = 0

    for sched in future_schedules:
        days_until = (sched.effective_from - today).days
        if days_until < 0:
            continue

        ent = await db.get(Entitlement, sched.ent_id)
        if not ent:
            continue

        contract = await db.get(Contract, ent.contract_id) if ent.contract_id else None
        stored = contract.renewal_alert_extra_days if contract else None
        thresholds = sorted(set(stored), reverse=True) if stored else RENEWAL_THRESHOLDS

        if days_until not in thresholds:
            continue

        if await _alert_exists_today(db, ent.ent_id, "PRICE_YEAR_CHANGE", days_until):
            continue

        # Fetch previous year for delta display
        prev_result = await db.execute(
            select(EntitlementPriceSchedule).where(
                and_(
                    EntitlementPriceSchedule.ent_id == sched.ent_id,
                    EntitlementPriceSchedule.year_number == sched.year_number - 1,
                )
            )
        )
        prev = prev_result.scalar_one_or_none()

        sw = await db.get(SoftwareCatalog, ent.sw_id)
        sw_name = sw.primary_sw_name if sw else ent.sw_id

        db.add(Alert(
            alert_type="PRICE_YEAR_CHANGE",
            ent_id=ent.ent_id,
            severity=_renewal_severity(days_until),
            days_to_expiry=days_until,
            title=f"Pricing change in {days_until} day{'s' if days_until != 1 else ''}: {sw_name} (Year {sched.year_number})",
            body_json={
                "ent_id": ent.ent_id,
                "sw_name": sw_name,
                "year_number": sched.year_number,
                "effective_from": str(sched.effective_from),
                "prev_seats": prev.entitled_count if prev else None,
                "new_seats": sched.entitled_count,
                "prev_unit_cost": prev.unit_cost if prev else None,
                "new_unit_cost": sched.unit_cost,
                "prev_annual_cost": prev.annual_cost if prev else None,
                "new_annual_cost": sched.annual_cost,
            },
            is_gxp=(sw.gxp_flag != "no") if sw else False,
        ))
        created += 1

    return created
```

- [ ] **Step 4: Call both functions at the start of `generate_alerts`**

Find the top of `generate_alerts`:
```python
async def generate_alerts(db: AsyncSession) -> int:
    """..."""
    created = 0
    ents_result = await db.execute(select(Entitlement))
```

Change to:
```python
async def generate_alerts(db: AsyncSession) -> int:
    """..."""
    # Sync active-year pricing before generating any alerts
    await sync_active_pricing(db)
    price_change_created = await generate_price_change_alerts(db)

    created = price_change_created
    ents_result = await db.execute(select(Entitlement))
```

- [ ] **Step 5: Write sync test**

Add to `backend/tests/test_price_schedules.py`:

```python
from datetime import date, timedelta
from app.services.alert_generator import sync_active_pricing, generate_price_change_alerts
from app.models.alerts import Alert


async def test_sync_active_pricing_updates_entitlement(db):
    """When Year 2 is active today, sync job updates entitlement columns."""
    import uuid as _uuid
    from app.models.catalog import SoftwareCatalog
    from app.models.contracts import Contract, Entitlement, EntitlementPriceSchedule

    today = date.today()
    yr1_start = today - timedelta(days=400)   # started > 1 year ago
    yr2_start = today - timedelta(days=35)    # Year 2 started 35 days ago
    yr2_end = yr1_start + timedelta(days=730) - timedelta(days=1)

    sw = SoftwareCatalog(
        sw_id="TEST-SYNC-001",
        primary_sw_name="Sync Test SW",
        gxp_flag="no",
        status="ACTIVE",
    )
    db.add(sw)
    await db.flush()

    contract = Contract(
        sw_id="TEST-SYNC-001",
        start_date=yr1_start,
        end_date=yr1_start + timedelta(days=730),
        storage_backend="local",
    )
    db.add(contract)
    await db.flush()

    ent = Entitlement(
        ent_id="ENT-SYNC-001",
        sw_id="TEST-SYNC-001",
        contract_id=contract.id,
        entitled_count=500,
        unit_cost=3600,
        annual_cost=1800000,
        status="ACTIVE",
    )
    db.add(ent)
    await db.flush()

    # Year 1 (past)
    db.add(EntitlementPriceSchedule(
        ent_id="ENT-SYNC-001", year_number=1,
        effective_from=yr1_start,
        effective_to=yr2_start - timedelta(days=1),
        entitled_count=500, unit_cost=3600, annual_cost=1800000,
    ))
    # Year 2 (currently active)
    db.add(EntitlementPriceSchedule(
        ent_id="ENT-SYNC-001", year_number=2,
        effective_from=yr2_start,
        effective_to=yr2_end,
        entitled_count=550, unit_cost=3800, annual_cost=2090000,
    ))
    await db.commit()

    synced = await sync_active_pricing(db)
    await db.commit()

    await db.refresh(ent)
    assert ent.unit_cost == 3800
    assert ent.annual_cost == 2090000
    assert ent.entitled_count == 550
    assert synced >= 1
```

- [ ] **Step 6: Write price-change alert test**

Add to `backend/tests/test_price_schedules.py`:

```python
async def test_price_change_alert_fires_within_threshold(db):
    """PRICE_YEAR_CHANGE alert is created when Year 2 effective_from is within threshold."""
    import uuid as _uuid
    from app.models.catalog import SoftwareCatalog
    from app.models.contracts import Contract, Entitlement, EntitlementPriceSchedule

    today = date.today()
    yr2_start = today + timedelta(days=30)   # exactly 30 days away — in default threshold

    sw = SoftwareCatalog(
        sw_id="TEST-ALERT-002",
        primary_sw_name="Alert Test SW",
        gxp_flag="no",
        status="ACTIVE",
    )
    db.add(sw)
    await db.flush()

    contract = Contract(
        sw_id="TEST-ALERT-002",
        start_date=today - timedelta(days=365),
        end_date=today + timedelta(days=730),
        storage_backend="local",
        renewal_alert_extra_days=[90, 60, 30, 15, 7, 1],
    )
    db.add(contract)
    await db.flush()

    ent = Entitlement(
        ent_id="ENT-ALERT-002",
        sw_id="TEST-ALERT-002",
        contract_id=contract.id,
        entitled_count=500,
        unit_cost=3600,
        annual_cost=1800000,
        status="ACTIVE",
    )
    db.add(ent)
    await db.flush()

    db.add(EntitlementPriceSchedule(
        ent_id="ENT-ALERT-002", year_number=1,
        effective_from=today - timedelta(days=365),
        effective_to=yr2_start - timedelta(days=1),
        entitled_count=500, unit_cost=3600, annual_cost=1800000,
    ))
    db.add(EntitlementPriceSchedule(
        ent_id="ENT-ALERT-002", year_number=2,
        effective_from=yr2_start,
        effective_to=yr2_start + timedelta(days=364),
        entitled_count=550, unit_cost=3800, annual_cost=2090000,
    ))
    await db.commit()

    count = await generate_price_change_alerts(db)
    await db.commit()

    assert count >= 1
    result = await db.execute(
        select(Alert).where(
            Alert.ent_id == "ENT-ALERT-002",
            Alert.alert_type == "PRICE_YEAR_CHANGE",
        )
    )
    alert = result.scalar_one_or_none()
    assert alert is not None
    assert alert.body_json["new_unit_cost"] == 3800
    assert alert.body_json["prev_unit_cost"] == 3600
```

- [ ] **Step 7: Run the tests**

```bash
cd backend
pytest tests/test_price_schedules.py::test_sync_active_pricing_updates_entitlement tests/test_price_schedules.py::test_price_change_alert_fires_within_threshold -v
```

Expected: both `PASSED`

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/alert_generator.py backend/tests/test_price_schedules.py
git commit -m "feat: add sync_active_pricing and price-change alert generation"
```

---

## Task 6: Dashboard — Total Committed Value

**Files:**
- Modify: `backend/app/schemas/dashboard.py`
- Modify: `backend/app/api/v1/routes/dashboard.py`

- [ ] **Step 1: Add field to dashboard schema**

In `backend/app/schemas/dashboard.py`, find the response schema that contains `total_annual_cost_inr` and add alongside it:

```python
total_committed_value_inr: int
```

- [ ] **Step 2: Compute total committed value in dashboard route**

In `backend/app/api/v1/routes/dashboard.py`, add the import:

```python
from app.models.contracts import Contract, Entitlement, EntitlementPriceSchedule
```

(Replace the existing contracts import line.)

After the `total_annual_cost` computation (around line 43), add:

```python
    # Total committed value = sum of all schedule rows; fall back to annual_cost for unscheduled ents
    from sqlalchemy import and_
    sched_result = await db.execute(select(EntitlementPriceSchedule))
    all_schedules = sched_result.scalars().all()
    scheduled_ent_ids = {s.ent_id for s in all_schedules}

    total_committed_value = sum(s.annual_cost for s in all_schedules)
    # Add annual_cost for entitlements that have no schedule rows
    total_committed_value += sum(
        (e.annual_cost or 0) for e in ents if e.ent_id not in scheduled_ent_ids
    )
```

- [ ] **Step 3: Pass the value into the response**

Find the return statement that includes `total_annual_cost_inr=total_annual_cost` and add:

```python
        total_committed_value_inr=total_committed_value,
```

- [ ] **Step 4: Verify no test regressions**

```bash
cd backend
pytest tests/test_cost_opt_dashboard.py -v
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/dashboard.py backend/app/api/v1/routes/dashboard.py
git commit -m "feat: add total_committed_value_inr to dashboard response"
```

---

## Task 7: Frontend — PriceScheduleTable Component

**Files:**
- Modify: `frontend/src/pages/Onboarding/OnboardingPage.jsx`

This task adds a `PriceScheduleTable` component and wires year-row auto-generation into `ManualFlow` and `LineItemCard`.

- [ ] **Step 1: Add `priceSchedule` to `newItem()`**

Find `newItem()` (line 11) and add `priceSchedule: []` to the returned object:

```js
function newItem(idx) {
  return {
    id: `item-${Date.now()}-${idx}`,
    contractName: "", primarySwName: "", swId: "",
    isExisting: false, isAiDetected: false,
    deployment: "cloud", regions: [], businessUnits: [], notes: "",
    licenseTypeId: "", metricId: "",
    entitledCount: "", unitCost: "", annualCost: "",
    gxpFlag: "no", aliasInput: "", aliases: [],
    categoryId: "", subCategoryId: "", vendorRisk: "LOW",
    aiEntitled: null,
    priceSchedule: [],
  };
}
```

- [ ] **Step 2: Add `buildYearRows` helper**

Add after the `DRL_REGIONS` constant (after line 25):

```js
function buildYearRows(startDate, endDate, existingSchedule = []) {
  if (!startDate || !endDate) return [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const numYears = Math.ceil((end - start) / (1000 * 60 * 60 * 24 * 365));
  if (numYears <= 1) return [];

  return Array.from({ length: numYears }, (_, i) => {
    const yr = i + 1;
    const fromD = new Date(start);
    fromD.setFullYear(fromD.getFullYear() + i);
    const toD = new Date(start);
    toD.setFullYear(toD.getFullYear() + yr);
    toD.setDate(toD.getDate() - 1);
    const from = fromD.toISOString().split("T")[0];
    const to = toD.toISOString().split("T")[0];
    const existing = existingSchedule.find(r => r.year === yr);
    return existing
      ? { ...existing, from, to }
      : { year: yr, from, to, seats: "", unitCost: "", annualCost: "" };
  });
}

function isToday(from, to) {
  const today = new Date().toISOString().split("T")[0];
  return from <= today && today <= to;
}
```

- [ ] **Step 3: Add `PriceScheduleTable` component**

Add before `LineItemCard` (before line 349):

```jsx
function PriceScheduleTable({ rows, onChange, currency = "INR" }) {
  const sym = currencySymbol(currency);
  const [open, setOpen] = useState(true);
  if (!rows || rows.length === 0) return null;

  const handleCell = (yr, field, val) => {
    const updated = rows.map(r => {
      if (r.year !== yr) return r;
      const next = { ...r, [field]: val };
      if (field === "seats" || field === "unitCost") {
        const s = parseInt(field === "seats" ? val : r.seats) || 0;
        const u = parseInt(field === "unitCost" ? val : r.unitCost) || 0;
        next.annualCost = s && u ? String(s * u) : "";
      }
      return next;
    });
    onChange(updated);
  };

  return (
    <div style={{ marginTop: 12, border: "1px solid var(--bdr)", borderRadius: 8, overflow: "hidden" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "var(--surf)", cursor: "pointer", userSelect: "none" }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--navy-mid)" }}>Multi-Year Pricing Schedule</span>
        <span style={{ fontSize: 11, color: "var(--tx-q)" }}>{open ? "▲ Hide" : "▼ Show"}</span>
      </div>
      {open && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--surf)", borderBottom: "2px solid var(--bdr)" }}>
                {["Year", "From", "To", "Seats", `Unit Cost (${sym})`, `Annual Cost (${sym})`].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, fontSize: 10, color: "var(--tx-q)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const active = isToday(r.from, r.to);
                return (
                  <tr key={r.year} style={{ borderBottom: "1px solid var(--bdr)", borderLeft: active ? "3px solid var(--navy-mid)" : "3px solid transparent" }}>
                    <td style={{ padding: "6px 10px", fontWeight: 700, color: active ? "var(--navy-mid)" : "var(--tx)" }}>
                      Year {r.year}{active && <span style={{ fontSize: 9, background: "var(--navy-mid)", color: "#fff", borderRadius: 3, padding: "1px 5px", marginLeft: 5 }}>NOW</span>}
                    </td>
                    <td style={{ padding: "6px 10px", color: "var(--tx-m)", fontSize: 11 }}>{r.from}</td>
                    <td style={{ padding: "6px 10px", color: "var(--tx-m)", fontSize: 11 }}>{r.to}</td>
                    <td style={{ padding: "4px 6px" }}>
                      <input type="number" className="fi2" style={{ width: 80 }}
                        value={r.seats} onChange={e => handleCell(r.year, "seats", e.target.value)}
                        placeholder="e.g. 500" />
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      <input type="number" className="fi2" style={{ width: 90 }}
                        value={r.unitCost} onChange={e => handleCell(r.year, "unitCost", e.target.value)}
                        placeholder="e.g. 3600" />
                    </td>
                    <td style={{ padding: "6px 10px", color: "var(--tx-m)", fontWeight: 600 }}>
                      {r.annualCost ? fmtCost(r.annualCost, currency) : <span style={{ color: "var(--tx-q)" }}>auto</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire year-row generation into `ManualFlow`**

In `ManualFlow`, add a `useEffect` that watches `meta.startDate` and `meta.endDate`. When both are set and span > 1 year, update each line item's `priceSchedule`.

Find the existing `useEffect` blocks (around line 1053) and add after the masters-loading effect:

```js
  useEffect(() => {
    if (!meta.startDate || !meta.endDate) return;
    setLineItems(ls => ls.map(item => {
      const rows = buildYearRows(meta.startDate, meta.endDate, item.priceSchedule);
      if (rows.length === 0) return { ...item, priceSchedule: [] };
      // Pre-fill empty rows with current item values; preserve already-edited rows
      const filled = rows.map((r, i) => ({
        ...r,
        seats: r.seats || (i === 0 ? item.entitledCount : (rows[i - 1]?.seats || item.entitledCount)),
        unitCost: r.unitCost || (i === 0 ? item.unitCost : (rows[i - 1]?.unitCost || item.unitCost)),
        annualCost: r.annualCost || "",
      }));
      return { ...item, priceSchedule: filled };
    }));
  }, [meta.startDate, meta.endDate]);
```

- [ ] **Step 5: Sync Year 1 row back to main cost fields in `LineItemCard`**

In `LineItemCard`, update `handleEntitled` and `handleUnit` to also sync into `priceSchedule[0]`:

Find `handleEntitled` (around line 361) and replace:

```js
  const handleEntitled = (val) => {
    const seats = parseInt(val) || 0;
    const cost  = parseInt(item.unitCost) || 0;
    const updatedSchedule = item.priceSchedule.length
      ? item.priceSchedule.map(r => r.year === 1
          ? { ...r, seats: val, annualCost: seats && cost ? String(seats * cost) : "" }
          : r)
      : item.priceSchedule;
    onChange({ ...item, entitledCount: val, annualCost: seats && cost ? String(seats * cost) : "", priceSchedule: updatedSchedule });
  };

  const handleUnit = (val) => {
    const seats = parseInt(item.entitledCount) || 0;
    const cost  = parseInt(val) || 0;
    const updatedSchedule = item.priceSchedule.length
      ? item.priceSchedule.map(r => r.year === 1
          ? { ...r, unitCost: val, annualCost: seats && cost ? String(seats * cost) : "" }
          : r)
      : item.priceSchedule;
    onChange({ ...item, unitCost: val, annualCost: seats && cost ? String(seats * cost) : "", priceSchedule: updatedSchedule });
  };
```

- [ ] **Step 6: Render `PriceScheduleTable` inside `LineItemCard`**

In the `LineItemCard` JSX, find the closing of Row 3 (Annual Cost row, around line 470) and add `PriceScheduleTable` after it, before Row 4:

```jsx
        {/* Multi-Year Pricing Schedule — auto-shown when contract is multi-year */}
        {item.priceSchedule.length > 0 && (
          <PriceScheduleTable
            rows={item.priceSchedule}
            onChange={rows => onChange({ ...item, priceSchedule: rows })}
            currency={currency}
          />
        )}
```

- [ ] **Step 7: Add `priceSchedule` to the publish payload**

In `handlePublish`, find the line item mapping and add `price_schedule`:

```js
          price_schedule: li.priceSchedule.length > 1
            ? li.priceSchedule.map(r => ({
                year_number: r.year,
                effective_from: r.from,
                effective_to: r.to,
                entitled_count: parseInt(r.seats) || 0,
                unit_cost: parseInt(r.unitCost) || 0,
                annual_cost: parseInt(r.annualCost) || (parseInt(r.seats) * parseInt(r.unitCost)) || 0,
              }))
            : undefined,
```

- [ ] **Step 8: Browser verification**

Start the dev server:
```bash
cd frontend && npm run dev
```

1. Open Onboard → Manual → enter start date `2026-01-26`, end date `2029-01-26`
2. Verify the Multi-Year Pricing Schedule table appears in each Line Item card with 3 rows
3. Year 1 dates should be `2026-01-26 → 2027-01-25`, Year 2 `2027-01-26 → 2028-01-25`, Year 3 `2028-01-26 → 2029-01-25`
4. Edit seats/unit cost — verify annual cost auto-computes per row
5. Edit main "Entitled Seats" field — verify Year 1 row updates
6. Change end date to within 1 year — verify schedule section disappears
7. Publish — inspect network request payload and confirm `price_schedule` array is present with 3 items

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/Onboarding/OnboardingPage.jsx
git commit -m "feat: add PriceScheduleTable component with auto year-row generation"
```

---

## Task 8: Full Integration Smoke Test

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend
pytest tests/ -v --tb=short 2>&1 | tail -30
```

Expected: all existing tests pass; new tests in `test_price_schedules.py` pass.

- [ ] **Step 2: Run the migration on the dev database and verify**

```bash
cd backend
alembic current   # should show 013
```

- [ ] **Step 3: End-to-end browser test**

1. Add a DOA contact in App Owners
2. Onboard a 3-year contract with 2 software line items, different prices per year
3. Confirm both entitlements appear in Software Catalog with Year 1 pricing
4. Open Dashboard — verify `Total Committed Value` is the sum of all three years' costs for both line items
5. In the test DB, manually set one `EntitlementPriceSchedule.effective_from` to today (simulating a year crossover), run the daily alert endpoint, and confirm the entitlement columns update

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: multi-year contract price schedules — complete implementation"
```
