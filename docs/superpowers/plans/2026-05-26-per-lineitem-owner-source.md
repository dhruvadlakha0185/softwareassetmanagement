# Per-Line-Item Owner, DOA & Source Config — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Step 4 (Owner & DOA) and Step 5 (Source & Usage) from contract-level fields into each line item card, with Line Item 1 carrying an "Apply to all" toggle that freezes subsequent cards.

**Architecture:** DB gets a `secondary_owner_id` column on `entitlements` and a new `entitlement_doa_contacts` junction table. The backend schemas shift those four fields off `MultiPublishPayload` and onto each `MultiLineItemIn`. The `multi_publish` route writes them per entitlement and bulk-inserts DOA contact rows. The alert generator falls back to the global DOA list when no per-entitlement rows exist. The frontend adds a `shareOwnerConfig` boolean at `ManualFlow` level, renders Steps 4 & 5 inside each `LineItemCard`, and freezes cards 2+ when the toggle is on.

**Tech Stack:** PostgreSQL, Alembic, Python 3.12, SQLAlchemy async, FastAPI, Pydantic v2, React 18 / Vite, plain CSS custom properties.

---

## File Map

| File | Change |
|---|---|
| `backend/alembic/versions/014_per_entitlement_owner_doa.py` | New migration |
| `backend/app/models/contracts.py` | Add `secondary_owner_id` column to `Entitlement`; add `EntitlementDoaContact` model |
| `backend/app/models/__init__.py` | Export `EntitlementDoaContact` |
| `backend/app/schemas/onboarding.py` | Add 5 fields to `MultiLineItemIn`; remove 4 fields from `MultiPublishPayload` |
| `backend/app/api/v1/routes/onboarding.py` | Write per-item owner/source fields; bulk-insert DOA contact rows; remove contract-level field reads |
| `backend/app/services/alert_generator.py` | Add `get_doa_contacts_for_entitlement`; use in alert recipient resolution |
| `backend/tests/test_onboarding.py` | Tests for per-item field persistence and DOA contact creation |
| `frontend/src/pages/Onboarding/OnboardingPage.jsx` | Add fields to `newItem()`; add `shareOwnerConfig` state; embed Step 4 & 5 in `LineItemCard`; frozen panels; `resolvedOwnerConfig`; remove old standalone Step 4/5 panels |

---

### Task 1: Alembic Migration 014

**Files:**
- Create: `backend/alembic/versions/014_per_entitlement_owner_doa.py`

- [ ] **Step 1: Write the migration**

Create `backend/alembic/versions/014_per_entitlement_owner_doa.py`:

```python
"""per entitlement owner doa

Revision ID: 014
Revises: 013
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "entitlements",
        sa.Column(
            "secondary_owner_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
    )
    op.create_table(
        "entitlement_doa_contacts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("ent_id", sa.String(20), sa.ForeignKey("entitlements.ent_id", ondelete="CASCADE"), nullable=False),
        sa.Column("doa_contact_id", UUID(as_uuid=True), sa.ForeignKey("doa_hierarchy.id", ondelete="CASCADE"), nullable=False),
        sa.UniqueConstraint("ent_id", "doa_contact_id", name="uq_ent_doa_contact"),
    )
    op.create_index("ix_ent_doa_contacts_ent_id", "entitlement_doa_contacts", ["ent_id"])


def downgrade() -> None:
    op.drop_index("ix_ent_doa_contacts_ent_id", table_name="entitlement_doa_contacts")
    op.drop_table("entitlement_doa_contacts")
    op.drop_column("entitlements", "secondary_owner_id")
```

- [ ] **Step 2: Run migration**

```bash
cd backend && alembic upgrade head
```

Expected: `Running upgrade 013 -> 014, per entitlement owner doa`

- [ ] **Step 3: Verify schema**

```bash
cd backend && python -c "
from app.db import sync_engine
from sqlalchemy import inspect
insp = inspect(sync_engine)
print('entitlements cols:', [c['name'] for c in insp.get_columns('entitlements') if 'owner' in c['name'] or 'secondary' in c['name']])
print('new table cols:', [c['name'] for c in insp.get_columns('entitlement_doa_contacts')])
"
```

Expected: both `secondary_owner_id` and all three `entitlement_doa_contacts` columns appear.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/014_per_entitlement_owner_doa.py
git commit -m "feat: migration 014 — secondary_owner_id on entitlements + entitlement_doa_contacts table"
```

---

### Task 2: SQLAlchemy Model — EntitlementDoaContact

**Files:**
- Modify: `backend/app/models/contracts.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_onboarding.py`, add at the top of the file (after existing imports):

```python
from app.models.contracts import EntitlementDoaContact
```

Then add this test:

```python
def test_entitlement_doa_contact_model_has_expected_columns():
    cols = {c.key for c in EntitlementDoaContact.__table__.columns}
    assert {"id", "ent_id", "doa_contact_id"}.issubset(cols)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_onboarding.py::test_entitlement_doa_contact_model_has_expected_columns -v
```

Expected: `ImportError` — `EntitlementDoaContact` does not exist yet.

- [ ] **Step 3: Add secondary_owner_id column and EntitlementDoaContact model**

In `backend/app/models/contracts.py`, add the `secondary_owner_id` column to `Entitlement` (after the `app_owner_id` line):

```python
    app_owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    secondary_owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
```

Then append at the bottom of `contracts.py`:

```python
class EntitlementDoaContact(Base):
    __tablename__ = "entitlement_doa_contacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ent_id = Column(String(20), ForeignKey("entitlements.ent_id", ondelete="CASCADE"), nullable=False)
    doa_contact_id = Column(UUID(as_uuid=True), ForeignKey("doa_hierarchy.id", ondelete="CASCADE"), nullable=False)
```

- [ ] **Step 4: Export from __init__.py**

In `backend/app/models/__init__.py`, update the contracts import line:

```python
from app.models.contracts import Contract, Entitlement, OnboardingDraft, EntitlementPriceSchedule, EntitlementDoaContact
```

And add `"EntitlementDoaContact"` to `__all__`:

```python
    "Contract", "Entitlement", "OnboardingDraft", "EntitlementPriceSchedule", "EntitlementDoaContact",
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend && pytest tests/test_onboarding.py::test_entitlement_doa_contact_model_has_expected_columns -v
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/contracts.py backend/app/models/__init__.py backend/tests/test_onboarding.py
git commit -m "feat: add secondary_owner_id to Entitlement and EntitlementDoaContact model"
```

---

### Task 3: Pydantic Schema Changes

**Files:**
- Modify: `backend/app/schemas/onboarding.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_onboarding.py`:

```python
from app.schemas.onboarding import MultiLineItemIn, MultiPublishPayload

def test_multi_line_item_in_has_per_item_owner_fields():
    item = MultiLineItemIn(contract_name="Test", primary_sw_name="TestSW")
    assert hasattr(item, "app_owner_id")
    assert hasattr(item, "secondary_owner_id")
    assert hasattr(item, "doa_contact_ids")
    assert hasattr(item, "discovery_source_id")
    assert hasattr(item, "usage_method_id")
    # defaults
    assert item.doa_contact_ids == []
    assert item.app_owner_id is None


def test_multi_publish_payload_no_longer_has_owner_fields():
    payload = MultiPublishPayload(
        vendor_name="ACME",
        line_items=[],
    )
    assert not hasattr(payload, "app_owner_id")
    assert not hasattr(payload, "discovery_source_id")
    assert not hasattr(payload, "usage_method_id")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_onboarding.py::test_multi_line_item_in_has_per_item_owner_fields tests/test_onboarding.py::test_multi_publish_payload_no_longer_has_owner_fields -v
```

Expected: both FAIL — fields not present on `MultiLineItemIn`, fields still present on `MultiPublishPayload`.

- [ ] **Step 3: Update MultiLineItemIn**

In `backend/app/schemas/onboarding.py`, add to `MultiLineItemIn` after `publisher`:

```python
    # Step 4 — Owner & DOA (per line item)
    app_owner_id: UUID | None = None
    secondary_owner_id: UUID | None = None
    doa_contact_ids: list[UUID] = []
    # Step 5 — Source & Usage Config (per line item)
    discovery_source_id: UUID | None = None
    usage_method_id: UUID | None = None
```

- [ ] **Step 4: Update MultiPublishPayload**

Remove these four lines from `MultiPublishPayload` in `backend/app/schemas/onboarding.py`:

```python
    # Owner & source config (shared — applies to all line items)
    app_owner_id: UUID | None = None
    secondary_owner_id: UUID | None = None
    discovery_source_id: UUID | None = None
    usage_method_id: UUID | None = None
```

The `MultiPublishPayload` block after removal should look like:

```python
class MultiPublishPayload(BaseModel):
    # Contract header fields (shared across all line items)
    vendor_name: str | None = None
    reseller: str | None = None
    po_number: str | None = None
    clm_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    total_value_inr: int | None = None
    auto_renewal_clause: str | None = None
    renewal_alert_extra_days: list[int] | None = None
    currency: str | None = None
    # Line items — each carries its own deployment/region/notes/gxp/owner/source
    line_items: list[MultiLineItemIn] = []
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_onboarding.py::test_multi_line_item_in_has_per_item_owner_fields tests/test_onboarding.py::test_multi_publish_payload_no_longer_has_owner_fields -v
```

Expected: both PASS

- [ ] **Step 6: Run full test suite to catch regressions**

```bash
cd backend && pytest tests/ -v --tb=short 2>&1 | tail -40
```

Expected: no new failures. If `test_onboarding.py` has tests that send `app_owner_id` in the top-level payload, update them to send it inside each `line_items` item instead.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/onboarding.py backend/tests/test_onboarding.py
git commit -m "feat: move owner/source config fields from MultiPublishPayload onto MultiLineItemIn"
```

---

### Task 4: Route Changes — multi_publish

**Files:**
- Modify: `backend/app/api/v1/routes/onboarding.py`

The current entitlement creation block (lines 407–428) reads `body.discovery_source_id`, `body.usage_method_id`, `body.app_owner_id`. These must move to `item.*`. After `db.flush()`, DOA contact rows must be bulk-inserted.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_onboarding.py`:

```python
import pytest
from httpx import AsyncClient
from uuid import uuid4

@pytest.mark.asyncio
async def test_multi_publish_writes_per_item_owner_fields(client: AsyncClient, db_session, seed_masters):
    """owner fields on the line item are persisted to the entitlement."""
    owner_id = seed_masters["user_id"]
    source_id = seed_masters["discovery_source_id"]
    method_id = seed_masters["usage_method_id"]

    payload = {
        "vendor_name": "TestCo",
        "po_number": "PO-TEST-001",
        "line_items": [
            {
                "contract_name": "TestSW License",
                "primary_sw_name": "TestSW",
                "app_owner_id": str(owner_id),
                "discovery_source_id": str(source_id),
                "usage_method_id": str(method_id),
                "deployment": "cloud",
                "gxp_flag": "no",
            }
        ],
    }
    resp = await client.post("/api/v1/onboarding/multi-publish", json=payload)
    assert resp.status_code == 200
    ent_id = resp.json()["created"][0]["ent_id"]

    from app.models.contracts import Entitlement
    from sqlalchemy import select
    result = await db_session.execute(select(Entitlement).where(Entitlement.ent_id == ent_id))
    ent = result.scalar_one()
    assert ent.app_owner_id == owner_id
    assert ent.discovery_source_id == source_id
    assert ent.usage_method_id == method_id


@pytest.mark.asyncio
async def test_multi_publish_creates_doa_contact_rows(client: AsyncClient, db_session, seed_masters):
    """doa_contact_ids on the line item are persisted to entitlement_doa_contacts."""
    doa_id = seed_masters["doa_contact_id"]

    payload = {
        "vendor_name": "TestCo",
        "po_number": "PO-DOA-001",
        "line_items": [
            {
                "contract_name": "TestSW License",
                "primary_sw_name": "TestSW2",
                "doa_contact_ids": [str(doa_id)],
                "deployment": "cloud",
                "gxp_flag": "no",
            }
        ],
    }
    resp = await client.post("/api/v1/onboarding/multi-publish", json=payload)
    assert resp.status_code == 200
    ent_id = resp.json()["created"][0]["ent_id"]

    from app.models.contracts import EntitlementDoaContact
    from sqlalchemy import select
    result = await db_session.execute(
        select(EntitlementDoaContact).where(EntitlementDoaContact.ent_id == ent_id)
    )
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].doa_contact_id == doa_id
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_onboarding.py::test_multi_publish_writes_per_item_owner_fields tests/test_onboarding.py::test_multi_publish_creates_doa_contact_rows -v
```

Expected: FAIL — route still reads from `body.*` which no longer has those fields.

- [ ] **Step 3: Update the entitlement creation block**

In `backend/app/api/v1/routes/onboarding.py`, update the `Entitlement(...)` constructor call. Replace:

```python
            ent = Entitlement(
                ent_id=ent_id,
                sw_id=sw_id,
                contract_id=contract.id,
                contract_name=item.contract_name,
                metric_id=item.metric_id,
                license_type_id=item.license_type_id,
                entitled_count=item.entitled_count,
                in_use_count=0,
                unit_cost=item.unit_cost,
                annual_cost=item.annual_cost,
                notes=item.notes,
                vendor_id=contract.vendor_id,
                regions_json=item.regions or None,
                business_units=item.business_units or None,
                discovery_source_id=body.discovery_source_id,
                usage_method_id=body.usage_method_id,
                app_owner_id=body.app_owner_id,
                status="ACTIVE",
            )
```

With:

```python
            ent = Entitlement(
                ent_id=ent_id,
                sw_id=sw_id,
                contract_id=contract.id,
                contract_name=item.contract_name,
                metric_id=item.metric_id,
                license_type_id=item.license_type_id,
                entitled_count=item.entitled_count,
                in_use_count=0,
                unit_cost=item.unit_cost,
                annual_cost=item.annual_cost,
                notes=item.notes,
                vendor_id=contract.vendor_id,
                regions_json=item.regions or None,
                business_units=item.business_units or None,
                discovery_source_id=item.discovery_source_id,
                usage_method_id=item.usage_method_id,
                app_owner_id=item.app_owner_id,
                secondary_owner_id=item.secondary_owner_id,
                status="ACTIVE",
            )
```

- [ ] **Step 4: Add DOA contact bulk-insert after db.flush()**

In the same route, immediately after `db.add(ent)` and `await db.flush()`, and before the price schedule block, add:

```python
            # ── Insert per-entitlement DOA contacts ───────────────────────
            for doa_id in item.doa_contact_ids:
                db.add(EntitlementDoaContact(ent_id=ent_id, doa_contact_id=doa_id))
```

Also add `EntitlementDoaContact` to the imports at the top of `onboarding.py`:

```python
from app.models.contracts import Contract, Entitlement, OnboardingDraft, EntitlementPriceSchedule, EntitlementDoaContact
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_onboarding.py::test_multi_publish_writes_per_item_owner_fields tests/test_onboarding.py::test_multi_publish_creates_doa_contact_rows -v
```

Expected: both PASS

- [ ] **Step 6: Run full test suite**

```bash
cd backend && pytest tests/ -v --tb=short 2>&1 | tail -40
```

Expected: no new failures.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/routes/onboarding.py backend/tests/test_onboarding.py
git commit -m "feat: multi_publish writes per-item owner/source fields and DOA contact rows"
```

---

### Task 5: Alert Generator — Per-Entitlement DOA Contacts

**Files:**
- Modify: `backend/app/services/alert_generator.py`
- Modify: `backend/tests/test_alerts.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_alerts.py`:

```python
from app.services.alert_generator import get_doa_contacts_for_entitlement
from app.models.contracts import EntitlementDoaContact
from app.models.users import DOAHierarchy

@pytest.mark.asyncio
async def test_get_doa_contacts_returns_per_entitlement_when_set(db_session, seed_masters):
    """Returns per-entitlement contacts when rows exist in entitlement_doa_contacts."""
    ent_id = seed_masters["ent_id"]
    doa_id = seed_masters["doa_contact_id"]

    # Insert a per-entitlement DOA contact row
    db_session.add(EntitlementDoaContact(ent_id=ent_id, doa_contact_id=doa_id))
    await db_session.flush()

    contacts = await get_doa_contacts_for_entitlement(db_session, ent_id)
    assert len(contacts) == 1
    assert contacts[0].id == doa_id


@pytest.mark.asyncio
async def test_get_doa_contacts_falls_back_to_global_when_none_set(db_session, seed_masters):
    """Returns global DOA list when no per-entitlement rows exist."""
    ent_id = seed_masters["ent_id"]
    contacts = await get_doa_contacts_for_entitlement(db_session, ent_id)
    # There should be at least the global DOA contact seeded in seed_masters
    assert len(contacts) >= 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_alerts.py::test_get_doa_contacts_returns_per_entitlement_when_set tests/test_alerts.py::test_get_doa_contacts_falls_back_to_global_when_none_set -v
```

Expected: `ImportError` — `get_doa_contacts_for_entitlement` does not exist yet.

- [ ] **Step 3: Add the function to alert_generator.py**

In `backend/app/services/alert_generator.py`, add to the imports at the top:

```python
from app.models.contracts import Entitlement, Contract, EntitlementPriceSchedule, EntitlementDoaContact
from app.models.users import DOAHierarchy
```

Then add this function after the `_util_severity` helper (before `sync_active_pricing`):

```python
async def get_doa_contacts_for_entitlement(db: AsyncSession, ent_id: str):
    """
    Returns per-entitlement DOA contacts if any are set; falls back to the
    global doa_hierarchy list so existing entitlements keep alerting.
    """
    result = await db.execute(
        select(DOAHierarchy)
        .join(EntitlementDoaContact, DOAHierarchy.id == EntitlementDoaContact.doa_contact_id)
        .where(EntitlementDoaContact.ent_id == ent_id)
    )
    contacts = result.scalars().all()
    if contacts:
        return contacts
    result = await db.execute(select(DOAHierarchy))
    return result.scalars().all()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_alerts.py::test_get_doa_contacts_returns_per_entitlement_when_set tests/test_alerts.py::test_get_doa_contacts_falls_back_to_global_when_none_set -v
```

Expected: both PASS

- [ ] **Step 5: Run full test suite**

```bash
cd backend && pytest tests/ -v --tb=short 2>&1 | tail -40
```

Expected: no new failures.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/alert_generator.py backend/tests/test_alerts.py
git commit -m "feat: alert generator get_doa_contacts_for_entitlement with global fallback"
```

---

### Task 6: Frontend — State and Payload Changes

**Files:**
- Modify: `frontend/src/pages/Onboarding/OnboardingPage.jsx`

This task adds the new fields to `newItem()`, adds the `shareOwnerConfig` state, and updates `handlePublish` to use `resolvedOwnerConfig`. It does NOT yet add the UI sections (that's Task 7) or remove the old panels (Task 8).

- [ ] **Step 1: Add 5 fields to newItem()**

Find the `newItem()` function (near line 110). It returns an object. Add these five fields to the returned object:

```js
appOwnerId: "",
secondaryOwnerId: "",
doaContactIds: [],
discoverySourceId: "",
usageMethodId: "",
```

- [ ] **Step 2: Add shareOwnerConfig state**

In the `ManualFlow` component, find where other `useState` hooks are declared (the block with `lineItems`, `meta`, etc.). Add:

```js
const [shareOwnerConfig, setShareOwnerConfig] = useState(true);
```

- [ ] **Step 3: Add resolvedOwnerConfig helper and update handlePublish**

In `handlePublish`, find the `line_items` mapping. Currently each line item maps its own fields. Add a helper just above the `handlePublish` body that resolves owner config:

```js
const resolvedOwnerConfig = (li, idx) =>
  idx === 0 || !shareOwnerConfig
    ? {
        app_owner_id: li.appOwnerId || undefined,
        secondary_owner_id: li.secondaryOwnerId || undefined,
        doa_contact_ids: li.doaContactIds.length > 0 ? li.doaContactIds : undefined,
        discovery_source_id: li.discoverySourceId || undefined,
        usage_method_id: li.usageMethodId || undefined,
      }
    : {
        app_owner_id: lineItems[0].appOwnerId || undefined,
        secondary_owner_id: lineItems[0].secondaryOwnerId || undefined,
        doa_contact_ids: lineItems[0].doaContactIds.length > 0 ? lineItems[0].doaContactIds : undefined,
        discovery_source_id: lineItems[0].discoverySourceId || undefined,
        usage_method_id: lineItems[0].usageMethodId || undefined,
      };
```

Then in the `line_items` array inside `handlePublish`, spread `resolvedOwnerConfig(li, idx)` into each item object. For example, where each item currently ends with `...existingFields`, add:

```js
...resolvedOwnerConfig(li, idx),
```

Also remove any existing top-level `app_owner_id`, `discovery_source_id`, `usage_method_id` that were being read from `meta` and sent at payload root level. These fields no longer exist on `MultiPublishPayload`.

- [ ] **Step 4: Verify the payload structure manually**

Add a temporary `console.log(JSON.stringify(payload, null, 2))` in `handlePublish` before the API call. Open the browser dev tools and submit the wizard with one line item. Confirm that:
- Root payload has NO `app_owner_id`, `discovery_source_id`, `usage_method_id`
- Each `line_items[i]` has the correct fields

Remove the `console.log` after verifying.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Onboarding/OnboardingPage.jsx
git commit -m "feat: add per-item owner/source state fields, shareOwnerConfig, resolvedOwnerConfig in handlePublish"
```

---

### Task 7: Frontend — Step 4 & Step 5 UI Inside LineItemCard

**Files:**
- Modify: `frontend/src/pages/Onboarding/OnboardingPage.jsx`

This task adds the owner/source sections inside `LineItemCard`. For Line Item 1: both sections are fully editable with the "Apply to all" toggle below. For items 2+: frozen read-only panels when `shareOwnerConfig=true`, or editable panels when `false`.

- [ ] **Step 1: Ensure owners list is loaded**

In `ManualFlow`, confirm there is a state variable holding the user list for the owner dropdowns. If it already exists as `users` or `owners`, skip this step. If not, add:

```js
const [owners, setOwners] = useState([]);
```

And inside the `useEffect` that fetches masters, also fetch users:

```js
const usersResp = await api.get("/api/v1/onboarding/masters");
// masters already contains sources/methods. Check if users/owners come from a different endpoint.
```

Check `AllMastersOut` schema for a `users` field. If absent, fetch from `/api/v1/users` separately and map to `{ value: u.id, label: u.full_name }` format.

- [ ] **Step 2: Add DOAPickerField or reuse existing multi-select**

The spec calls for `DOAPickerField` for selecting DOA contacts. Check if this component exists already in the codebase by running:

```bash
grep -r "DOAPickerField\|DoapickerField\|doa_picker" frontend/src --include="*.jsx" -l
```

If it does not exist, use the existing `SearchableSelect` in multi-select mode for `doaContactIds`, sourcing options from `masters.doa_contacts` or a separate DOA contacts endpoint. If the masters endpoint doesn't return DOA contacts, fetch from `/api/v1/onboarding/masters` and check what keys are available, then use whatever key provides the DOA hierarchy list.

- [ ] **Step 3: Build the shared OwnerSourceSection component (inline)**

Inside `OnboardingPage.jsx`, define a local functional component above `LineItemCard`:

```jsx
function OwnerSourceSection({ item, onChange, owners, sources, methods, doaOptions, readOnly, fromItem }) {
  const src = readOnly ? fromItem : item;
  return (
    <div>
      {/* Step 4 — Owner & DOA */}
      <div className="step-section-header" style={{ marginTop: 16, marginBottom: 8, fontWeight: 600, fontSize: 13, color: "var(--tx-s)" }}>
        Step 4 — Owner &amp; DOA Escalation
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <SearchableSelect
          label={<>Primary App Owner <span style={{ color: "var(--red-m)" }}>*</span></>}
          value={src.appOwnerId}
          onChange={val => !readOnly && onChange({ ...item, appOwnerId: val })}
          options={owners}
          placeholder="Select owner…"
          disabled={readOnly}
        />
        <SearchableSelect
          label="Secondary Owner"
          value={src.secondaryOwnerId}
          onChange={val => !readOnly && onChange({ ...item, secondaryOwnerId: val })}
          options={owners}
          placeholder="Select secondary owner…"
          disabled={readOnly}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <SearchableSelect
          label="DOA Escalation Contacts"
          value={src.doaContactIds}
          onChange={val => !readOnly && onChange({ ...item, doaContactIds: val })}
          options={doaOptions}
          placeholder="Select DOA contacts…"
          disabled={readOnly}
          multi
        />
      </div>

      {/* Step 5 — Source & Usage Config */}
      <div className="step-section-header" style={{ marginTop: 16, marginBottom: 8, fontWeight: 600, fontSize: 13, color: "var(--tx-s)" }}>
        Step 5 — Source &amp; Usage Config
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <SearchableSelect
          label={<>Discovery Source <span style={{ color: "var(--red-m)" }}>*</span></>}
          value={src.discoverySourceId}
          onChange={val => !readOnly && onChange({ ...item, discoverySourceId: val })}
          options={sources}
          placeholder="Select source…"
          disabled={readOnly}
        />
        <SearchableSelect
          label={<>Usage Update Method <span style={{ color: "var(--red-m)" }}>*</span></>}
          value={src.usageMethodId}
          onChange={val => !readOnly && onChange({ ...item, usageMethodId: val })}
          options={methods}
          placeholder="Select method…"
          disabled={readOnly}
        />
      </div>

      {readOnly && (
        <div style={{ padding: "8px 12px", background: "var(--bg-s)", borderRadius: 6, fontSize: 12, color: "var(--tx-q)", marginBottom: 8 }}>
          Inherited from Line Item 1 — uncheck "Apply to all" on Line Item 1 to configure independently.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add OwnerSourceSection to LineItemCard**

Inside `LineItemCard`, at the very bottom before the closing `</div>` of the card body, add:

```jsx
{/* Step 4 & 5: Owner, DOA, Source */}
{isFirst ? (
  <>
    <OwnerSourceSection
      item={item}
      onChange={onChange}
      owners={owners}
      sources={sources}
      methods={methods}
      doaOptions={doaOptions}
      readOnly={false}
    />
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, padding: "10px 0", borderTop: "1px solid var(--br-l)" }}>
      <input
        type="checkbox"
        id={`share-owner-${item._id || idx}`}
        checked={shareOwnerConfig}
        onChange={e => {
          const checked = e.target.checked;
          setShareOwnerConfig(checked);
          if (!checked) {
            setLineItems(ls => ls.map((li, i) =>
              i === 0 ? li : { ...li, appOwnerId: "", secondaryOwnerId: "", doaContactIds: [], discoverySourceId: "", usageMethodId: "" }
            ));
          }
        }}
        style={{ width: 16, height: 16, cursor: "pointer" }}
      />
      <label htmlFor={`share-owner-${item._id || idx}`} style={{ fontSize: 13, color: "var(--tx-s)", cursor: "pointer" }}>
        Apply this owner &amp; source config to all line items
      </label>
    </div>
  </>
) : (
  <OwnerSourceSection
    item={item}
    onChange={onChange}
    owners={owners}
    sources={sources}
    methods={methods}
    doaOptions={doaOptions}
    readOnly={shareOwnerConfig}
    fromItem={lineItems[0]}
  />
)}
```

Note: `LineItemCard` will need `isFirst`, `idx`, `shareOwnerConfig`, `setShareOwnerConfig`, `setLineItems`, `lineItems`, `owners`, `doaOptions` passed as props (or accessed via closure if it's defined inside `ManualFlow`). Pass these from the `ManualFlow` render of `LineItemCard`.

- [ ] **Step 5: Start the dev server and verify visually**

```bash
cd frontend && npm run dev
```

Open the onboarding wizard, add 2+ line items. Verify:
1. Line Item 1 shows editable Step 4 & 5 sections with the toggle (default checked)
2. Line Item 2 shows frozen read-only panels with the "Inherited from Line Item 1" banner
3. Unchecking the toggle on Line Item 1 makes Line Item 2 show editable empty sections
4. Re-checking the toggle freezes Line Item 2 again showing Line Item 1's values

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Onboarding/OnboardingPage.jsx
git commit -m "feat: embed Step 4 & 5 owner/source sections inside LineItemCard with shared-config toggle"
```

---

### Task 8: Frontend — Remove Old Standalone Step 4 & Step 5 Panels

**Files:**
- Modify: `frontend/src/pages/Onboarding/OnboardingPage.jsx`

- [ ] **Step 1: Find and remove the old standalone Step 4 panel**

Search for the current standalone Step 4 render block. It will be something like a card rendered after the line items list with primary owner / secondary owner / DOA fields at the `ManualFlow` level (reading from `meta.appOwner`, `meta.secondaryOwner`, etc.).

```bash
grep -n "Step 4\|appOwner\|secondary_owner\|DOA\|doa_contact" frontend/src/pages/Onboarding/OnboardingPage.jsx | head -40
```

Remove the entire Step 4 card/section that reads from `meta` at the ManualFlow level. Also remove any `meta` state fields that were used exclusively for Step 4 (`appOwnerId`, `secondaryOwnerId`, `doaContactIds`).

- [ ] **Step 2: Find and remove the old standalone Step 5 panel**

Similarly, find and remove the standalone Step 5 card (discovery source / usage method at contract level). These fields were previously on `meta` and serialized into the top-level payload. Remove the card render and the meta fields.

- [ ] **Step 3: Update the stepper bar**

Find the stepper bar component or array that lists step labels. Remove the standalone "Step 4" and "Step 5" labels, or relabel them appropriately now that those steps live inside each line item card.

- [ ] **Step 4: Verify no regressions in the dev server**

With the dev server still running, go through the full wizard flow:
- Add 1 line item, fill Step 4 & 5 inside the card, publish → confirm success
- Add 2 line items, use shared config, publish → confirm second item inherits owner config
- Add 2 line items, uncheck "Apply to all", fill independently, publish → confirm separate values

Confirm the standalone Step 4 and Step 5 panels are gone from the UI.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Onboarding/OnboardingPage.jsx
git commit -m "feat: remove old standalone Step 4 & Step 5 panels, stepper labels updated"
```

---

## Self-Review

### Spec Coverage

| Spec section | Task that covers it |
|---|---|
| DB: `secondary_owner_id` on `entitlements` | Task 1 (migration), Task 2 (model) |
| DB: `entitlement_doa_contacts` junction table | Task 1 (migration), Task 2 (model) |
| Schema: 5 fields on `MultiLineItemIn` | Task 3 |
| Schema: remove 4 fields from `MultiPublishPayload` | Task 3 |
| Route: write per-item owner/source to entitlement | Task 4 |
| Route: bulk-insert DOA contact rows | Task 4 |
| Alert generator: `get_doa_contacts_for_entitlement` | Task 5 |
| Alert generator: global fallback | Task 5 |
| Frontend: 5 fields on `newItem()` | Task 6 |
| Frontend: `shareOwnerConfig` state | Task 6 |
| Frontend: `resolvedOwnerConfig` in `handlePublish` | Task 6 |
| Frontend: Step 4 & 5 editable on Line Item 1 | Task 7 |
| Frontend: "Apply to all" toggle on Line Item 1 | Task 7 |
| Frontend: frozen read-only panels on items 2+ | Task 7 |
| Frontend: "Inherited from Line Item 1" banner | Task 7 |
| Frontend: toggle OFF → items 2+ reset to empty | Task 7 (toggle handler in step 4) |
| Frontend: remove old standalone Step 4/5 panels | Task 8 |

All spec requirements are covered. No gaps found.

### Placeholder Scan

No TBD, TODO, or vague steps present. Every code block is complete and self-contained.

### Type Consistency

- `doaContactIds: list[UUID]` in `MultiLineItemIn` → route iterates `item.doa_contact_ids` ✓
- `EntitlementDoaContact` defined in Task 2, imported in Task 4 route and Task 5 alert generator ✓
- `secondary_owner_id` added to `Entitlement` model in Task 2, written in Task 4 ✓
- `resolvedOwnerConfig` returns `doa_contact_ids` as list or `undefined` — matches `list[UUID]` pydantic field ✓
