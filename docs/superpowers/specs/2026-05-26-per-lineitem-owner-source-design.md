# Per-Line-Item Owner, DOA & Source Config — Design Spec

**Date:** 2026-05-26
**Status:** Awaiting implementation

---

## Problem Statement

Steps 4 (Owner & DOA Escalation) and Step 5 (Source & Usage Config) are currently contract-level — a single set of fields applied identically to every line item under the contract. This does not reflect reality: a single PO can cover Microsoft 365 (IT-owned, different escalation path) and SAP (Finance-owned, different escalation path). Each software entitlement needs its own primary owner, secondary owner, DOA escalation contacts, discovery source, and usage update method.

---

## Scope

- Move Steps 4 and Step 5 fields from contract-level into each `LineItemCard`
- Line Item 1 carries a "Apply to all line items" toggle (default ON)
- When ON: subsequent items show frozen read-only panels sourced from Line Item 1
- When toggled OFF: subsequent items show empty independently-editable panels
- Database: add `secondary_owner_id` to `entitlements`; add `entitlement_doa_contacts` junction table
- Alert generator: use per-entitlement DOA contacts when set; fall back to global DOA list otherwise

---

## 1. Database Schema

### New column on `entitlements`

| Column | Type | Constraints |
|---|---|---|
| `secondary_owner_id` | UUID | FK → users(id) nullable |

### New table: `entitlement_doa_contacts`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK, default uuid4 |
| `ent_id` | String(20) | FK → entitlements(ent_id) ON DELETE CASCADE |
| `doa_contact_id` | UUID | FK → doa_hierarchy(id) ON DELETE CASCADE |

**Constraint:** UNIQUE(`ent_id`, `doa_contact_id`)

**Index:** `(ent_id)` for fast per-entitlement lookup.

### Migration

`014_per_entitlement_owner_doa.py` — adds `secondary_owner_id` column and creates `entitlement_doa_contacts` table. No data migration required for existing entitlements.

---

## 2. Backend — Schema Changes

### `MultiLineItemIn` (onboarding schema)

Add to the existing `MultiLineItemIn` model:

```python
app_owner_id: UUID | None = None
secondary_owner_id: UUID | None = None
doa_contact_ids: list[UUID] = []
discovery_source_id: UUID | None = None
usage_method_id: UUID | None = None
```

### `MultiPublishPayload` (onboarding schema)

Remove the contract-level fields that are now per-line-item:
- `app_owner_id`
- `discovery_source_id`
- `usage_method_id`

(`secondary_owner_id` was never a top-level payload field — it is new and lives only on `MultiLineItemIn`.)

These are no longer top-level payload fields; they travel with each line item.

### New SQLAlchemy model: `EntitlementDoaContact`

```python
class EntitlementDoaContact(Base):
    __tablename__ = "entitlement_doa_contacts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ent_id = Column(String(20), ForeignKey("entitlements.ent_id", ondelete="CASCADE"), nullable=False)
    doa_contact_id = Column(UUID(as_uuid=True), ForeignKey("doa_hierarchy.id", ondelete="CASCADE"), nullable=False)
```

Export from `app/models/__init__.py`.

---

## 3. Backend — Route Changes

### `multi_publish` route (`onboarding.py`)

For each line item, after the entitlement is created and flushed:

1. Write `ent.app_owner_id = item.app_owner_id`
2. Write `ent.secondary_owner_id = item.secondary_owner_id`
3. Write `ent.discovery_source_id = item.discovery_source_id`
4. Write `ent.usage_method_id = item.usage_method_id`
5. Bulk-insert `EntitlementDoaContact` rows for each id in `item.doa_contact_ids`

Remove the existing block that reads `app_owner_id`, `secondary_owner_id`, `discovery_source_id`, `usage_method_id` from the top-level `MultiPublishPayload`.

---

## 4. Backend — Alert Generator

### DOA contact resolution

When building the alert recipient list for an entitlement, the alert generator currently reads the global `doa_hierarchy` table. Change to:

```python
async def get_doa_contacts_for_entitlement(db, ent_id):
    result = await db.execute(
        select(DoaHierarchy)
        .join(EntitlementDoaContact, DoaHierarchy.id == EntitlementDoaContact.doa_contact_id)
        .where(EntitlementDoaContact.ent_id == ent_id)
    )
    contacts = result.scalars().all()
    if contacts:
        return contacts
    # Fall back to global DOA list for entitlements without per-entitlement contacts
    result = await db.execute(select(DoaHierarchy))
    return result.scalars().all()
```

This is a non-breaking change — existing entitlements that have no `entitlement_doa_contacts` rows continue to alert the full global DOA list.

---

## 5. Frontend — State Changes

### `newItem()` additions

```js
appOwnerId: "",
secondaryOwnerId: "",
doaContactIds: [],
discoverySourceId: "",
usageMethodId: "",
```

### `ManualFlow` state addition

```js
const [shareOwnerConfig, setShareOwnerConfig] = useState(true);
```

### Toggle behaviour

- **true → false:** call `setLineItems(ls => ls.map((item, i) => i === 0 ? item : { ...item, appOwnerId: "", secondaryOwnerId: "", doaContactIds: [], discoverySourceId: "", usageMethodId: "" }))` — subsequent items reset to empty.
- **false → true:** no state change needed on other items — when frozen they display Line Item 1's live values directly (read from `lineItems[0]`).

---

## 6. Frontend — UI

### Line Item 1 Card — new sections at bottom

**Step 4 — Owner & DOA** (fully editable):
- Primary App Owner (`SearchableSelect`, required)
- Secondary Owner (`SearchableSelect`, optional)
- DOA Contacts (`DOAPickerField`)

**Step 5 — Source & Usage Config** (fully editable):
- Discovery Source (`SearchableSelect`, required)
- Usage Update Method (`SearchableSelect`, required)

**Shared config toggle** (below Step 5, or between Step 4 header and content):
```
☑  Apply this owner & source config to all line items
```
Default: checked. Styled as a prominent checkbox with a short description.

### Line Items 2, 3… — frozen state (shareOwnerConfig = true)

Both sections rendered as non-interactive read-only panels. Values sourced live from `lineItems[0]`. Banner at the top of the frozen block:

> *"Inherited from Line Item 1 — uncheck 'Apply to all' on Line Item 1 to configure independently."*

Fields displayed as static text (not inputs), visually muted (`color: var(--tx-q)`).

### Line Items 2, 3… — independent state (shareOwnerConfig = false)

Both sections rendered as fully editable (same component as Line Item 1, without the toggle).

### Removal

The existing standalone Step 4 and Step 5 panels (currently rendered after the line items list) are removed entirely. The step labels in the stepper bar are updated accordingly.

---

## 7. Publish Payload

Each line item serialises its own fields:

```js
{
  ...existingLineItemFields,
  app_owner_id: li.appOwnerId || undefined,
  secondary_owner_id: li.secondaryOwnerId || undefined,
  doa_contact_ids: li.doaContactIds.length > 0 ? li.doaContactIds : undefined,
  discovery_source_id: li.discoverySourceId || undefined,
  usage_method_id: li.usageMethodId || undefined,
}
```

When `shareOwnerConfig = true`, Line Items 2+ in the frontend hold empty strings/arrays — but their published payload fields will be populated from `lineItems[0]` values at publish time (not from item state directly). This is a mapping step in `handlePublish`:

```js
const resolvedOwnerConfig = (li, idx) => idx === 0 || !shareOwnerConfig
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

This means the frozen UI display and the published values are always in sync with Line Item 1.

---

## 8. Files to Change

| File | Change |
|---|---|
| `backend/alembic/versions/014_per_entitlement_owner_doa.py` | New migration |
| `backend/app/models/contracts.py` | Add `secondary_owner_id` to `Entitlement`; add `EntitlementDoaContact` model |
| `backend/app/models/__init__.py` | Export `EntitlementDoaContact` |
| `backend/app/schemas/onboarding.py` | Add 5 fields to `MultiLineItemIn`; remove 4 fields from `MultiPublishPayload` |
| `backend/app/api/v1/routes/onboarding.py` | Write per-item owner/source fields; bulk-insert DOA contact rows |
| `backend/app/services/alert_generator.py` | Add `get_doa_contacts_for_entitlement`; use it in alert recipient resolution |
| `frontend/src/pages/Onboarding/OnboardingPage.jsx` | Add 5 fields to `newItem()`; add `shareOwnerConfig` state; add Step 4 & 5 sections to `LineItemCard`; add frozen panel for subsequent items; update `handlePublish`; remove old standalone Step 4 & Step 5 panels |

---

## Out of Scope

- Per-item override when `shareOwnerConfig` is true (items are either all-shared or all-independent)
- Editing per-entitlement DOA contacts after publish (separate flow)
- Migrating existing entitlements to the new per-entitlement DOA structure
