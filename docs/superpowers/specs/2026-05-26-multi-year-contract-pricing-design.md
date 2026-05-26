# Multi-Year Contract Price Schedules — Design Spec

**Date:** 2026-05-26
**Status:** Awaiting implementation

---

## Problem Statement

The current SAM platform stores a single flat `unit_cost` and `annual_cost` on each `Entitlement`. This cannot represent a 3-year contract where Year 1 is 500 seats at ₹3,600/seat, Year 2 is 550 seats at ₹3,800/seat, and Year 3 is 600 seats at ₹4,000/seat — all under one PO and CLM ID.

The system must:
1. Auto-detect multi-year contracts from the contract date span
2. Capture per-year seat count and pricing during onboarding
3. Always surface the **currently active year's pricing** in dashboards and reconciliation
4. Alert when an upcoming year-boundary pricing change is within the configured alert window

---

## Scope

- Contracts that span more than one calendar year (anniversary-based, not fiscal year)
- Both seat count and unit cost can differ per year
- One PO / one CLM ID for the full term — not treated as separate renewals
- Existing single-year contracts are unaffected; no migration of existing data

---

## 1. Data Model

### New Table: `entitlement_price_schedules`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK, default uuid4 |
| `ent_id` | String | FK → entitlements(ent_id) ON DELETE CASCADE |
| `year_number` | Integer | 1, 2, 3… (unique per ent_id) |
| `effective_from` | Date | NOT NULL |
| `effective_to` | Date | NOT NULL |
| `entitled_count` | BigInteger | NOT NULL |
| `unit_cost` | BigInteger | NOT NULL |
| `annual_cost` | BigInteger | NOT NULL (= entitled_count × unit_cost) |
| `created_at` | DateTime | default utcnow |

**Index:** `(ent_id, effective_from, effective_to)` for fast "active as of today" queries.

### Backward Compatibility

The existing `unit_cost` and `annual_cost` columns on `Entitlement` are kept and always reflect **Year 1 values**. All existing queries, reports, and API responses that read these columns continue to work unchanged for single-year contracts. For multi-year contracts, dashboards prefer the active schedule row but fall back to the entitlement columns if no schedule exists.

---

## 2. Year Row Auto-Generation Logic

### Trigger

Computed from the contract `start_date` and `end_date` entered in Step 1–2 of the onboarding wizard.

```
num_years = ceil((end_date − start_date).days / 365)
```

If `num_years > 1`, the price schedule UI is revealed in each Step 3 line item card.

### Year Boundary Calculation

For a contract running **26 Jan 2026 → 26 Jan 2029**:

| Year | effective_from | effective_to |
|---|---|---|
| 1 | 2026-01-26 | 2027-01-25 |
| 2 | 2027-01-26 | 2028-01-25 |
| 3 | 2028-01-26 | 2029-01-25 |

Formula: `effective_from_year_N = start_date + (N−1) years`, `effective_to_year_N = start_date + N years − 1 day`.

### Pre-fill Behaviour

Year 2, 3… rows are pre-populated with Year 1's `entitled_count`, `unit_cost`, and `annual_cost`. The user edits only what changes. Year 1 row values are kept in sync with the main cost fields displayed above the schedule table.

---

## 3. Step 3 UI — Line Item Card

### Multi-Year Pricing Section

Appears automatically below the existing cost row when `num_years > 1`. Collapsed by default if Year 2+ values are identical to Year 1 (no changes yet); expanded once any year differs.

```
┌─────────────────────────────────────────────────────────────────┐
│ Multi-Year Pricing Schedule                              ▼ Hide │
├──────┬─────────────┬─────────────┬────────────┬──────────┬──────┤
│ Year │ From        │ To          │ Seats      │ Unit Cost│ Ann. │
├──────┼─────────────┼─────────────┼────────────┼──────────┼──────┤
│  1 ● │ 26 Jan 2026 │ 25 Jan 2027 │ [  500   ] │ [3,600]  │ auto │
│  2   │ 26 Jan 2027 │ 25 Jan 2028 │ [  550   ] │ [3,800]  │ auto │
│  3   │ 26 Jan 2028 │ 25 Jan 2029 │ [  600   ] │ [4,000]  │ auto │
└──────┴─────────────┴─────────────┴────────────┴──────────┴──────┘
● = currently active year (highlighted)
```

- **Dates:** read-only, derived from contract dates
- **Seats / Unit Cost:** editable number inputs
- **Annual Cost:** auto-computed (`seats × unit_cost`), read-only
- **Active year indicator:** current year row highlighted with a blue-left border or badge — computed from today's date vs effective_from/to
- **Validation:** All year rows must have `entitled_count > 0` and `unit_cost > 0` before publish

---

## 4. Backend — Schema & Route Changes

### `MultiLineItemIn` (onboarding schema)

Add optional field:
```python
price_schedule: list[PriceScheduleIn] = []
```

### New Pydantic schemas

```python
class PriceScheduleIn(BaseModel):
    year_number: int
    effective_from: date
    effective_to: date
    entitled_count: int
    unit_cost: int
    annual_cost: int

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

### `multi_publish` route changes

After creating each `Entitlement`, if `line_item.price_schedule` is non-empty:
1. Bulk-insert `EntitlementPriceSchedule` rows for that `ent_id`
2. Set `entitlement.unit_cost` and `entitlement.annual_cost` from Year 1 schedule row (single source of truth)

### New helper: `get_active_schedule(ent_id, as_of: date = today)`

```python
async def get_active_schedule(db, ent_id, as_of=date.today()):
    row = await db.execute(
        select(EntitlementPriceSchedule)
        .where(EntitlementPriceSchedule.ent_id == ent_id)
        .where(EntitlementPriceSchedule.effective_from <= as_of)
        .where(EntitlementPriceSchedule.effective_to >= as_of)
    )
    return row.scalar_one_or_none()
```

Returns `None` for single-year contracts — callers fall back to `entitlement.unit_cost / annual_cost`.

---

## 5. Dashboard & Cost Metrics

Two metrics exposed for multi-year contracts:

| Metric | Source | Description |
|---|---|---|
| **Current Year Cost** | `active_schedule.annual_cost` | What DRL is paying in the active contract year |
| **Total Committed Value** | `SUM(annual_cost)` across all schedule rows | Full financial exposure across the contract term |

For single-year contracts, **Current Year Cost = Total Committed Value = entitlement.annual_cost** (no change).

The dashboard cost roll-ups, cost optimisation tiles, and entitlement cards all use `get_active_schedule()` to fetch the correct pricing as of today.

---

## 6. Pricing Change Alerts

### Trigger Condition

An alert fires when today falls within `renewal_alert_extra_days` days **before** the `effective_from` of any Year 2+ schedule row.

Example: if `renewal_alert_extra_days = [30, 15, 7]` and Year 2 starts on 2027-01-26, alerts fire on 2026-12-27, 2027-01-11, and 2027-01-19.

### Alert Payload

```
Type: PRICE_YEAR_CHANGE
Software: Microsoft 365 E3
Contract: EA-2026-MSFT-001
Transition: Year 1 → Year 2 on 26 Jan 2027
Change: 500 seats @ ₹3,600 → 550 seats @ ₹3,800
New Annual Cost: ₹2,09,00,000 (↑ ₹19,00,000)
```

Alert is sent to all DOA escalation contacts and the contract's Primary App Owner.

### Implementation

The existing `alert_generator.py` already iterates over entitlements and checks dates. Add a new check:

```python
for schedule in upcoming_year_schedules:
    days_until = (schedule.effective_from - today).days
    if days_until in renewal_alert_extra_days:
        generate_price_change_alert(entitlement, schedule, prev_schedule)
```

---

## 7. Migration Plan

| Migration | Description |
|---|---|
| `013_entitlement_price_schedules.py` | Create `entitlement_price_schedules` table with index |

No changes to existing columns. No data migration required for existing entitlements.

---

## 8. Files to Change

| File | Change |
|---|---|
| `backend/alembic/versions/013_entitlement_price_schedules.py` | New migration |
| `backend/app/models/contracts.py` | Add `EntitlementPriceSchedule` model |
| `backend/app/schemas/onboarding.py` | Add `PriceScheduleIn`, update `MultiLineItemIn` |
| `backend/app/schemas/entitlements.py` | Add `PriceScheduleOut` |
| `backend/app/api/v1/routes/onboarding.py` | Insert schedule rows in `multi_publish` |
| `backend/app/services/alert_generator.py` | Add year-change alert logic |
| `frontend/src/pages/Onboarding/OnboardingPage.jsx` | Add `PriceScheduleTable` component to `LineItemCard` |
| `frontend/src/pages/Dashboard/` | Use active schedule for cost metrics |

---

## Out of Scope

- Mid-year pricing amendments (contract addendums) — handled as a separate flow
- Fiscal-year vs anniversary-year alignment — anniversary-based only
- Partial-year pro-ration on contract start
- Per-line-item alert interval overrides (all line items inherit the contract's `renewal_alert_extra_days`)
