# Multi-Year Contract Price Schedules — Design Spec

**Date:** 2026-05-26
**Status:** Awaiting implementation

---

## Problem Statement

The current SAM platform stores a single flat `unit_cost` and `annual_cost` on each `Entitlement`. This cannot represent a 3-year contract where Year 1 is 500 seats at ₹3,600/seat, Year 2 is 550 seats at ₹3,800/seat, and Year 3 is 600 seats at ₹4,000/seat — all under one PO and CLM ID.

The system must:
1. Auto-detect multi-year contracts from the contract date span
2. Capture per-year seat count and pricing during onboarding
3. Always surface the **currently active year's pricing** everywhere — dashboards, software catalog, reconciliation, cost optimisation, savings calculations
4. Alert DOA contacts and the Primary App Owner when an upcoming year-boundary pricing change is within the configured alert window

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

### Active Pricing Sync Strategy

Rather than modifying every consumer of `ent.unit_cost` (reconciliation engine, cost_opt route, catalog route), the `Entitlement` row itself is kept current:

- On initial publish, `entitlement.unit_cost`, `entitlement.annual_cost`, and `entitlement.entitled_count` are set from the **Year 1 schedule row** — identical to today's behaviour.
- A **nightly sync job** (`sync_active_pricing`) runs as part of the existing daily alert pass. For every entitlement with a price schedule, it checks whether the active year has changed since yesterday. If it has, it updates `entitlement.unit_cost`, `entitlement.annual_cost`, and `entitlement.entitled_count` to match the newly active schedule row.

This means **zero changes to `reconciliation_engine.py`, `cost_opt.py`, or `catalog.py`** — they all read from `ent.unit_cost` / `ent.annual_cost` as they do today, and those values are always the current active year's figures.

The schedule table provides the full history and future schedule for audit, display, and alerting — it is not re-read at query time by consumers.

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

Year 2, 3… rows pre-populate with Year 1's `entitled_count`, `unit_cost`, and `annual_cost`. The user edits only what changes. Year 1 row values stay in sync with the main cost fields displayed above the schedule table.

---

## 3. Step 3 UI — Line Item Card

### Multi-Year Pricing Section

Appears automatically below the existing cost row when `num_years > 1`. Collapsed by default if Year 2+ values match Year 1 (user hasn't edited anything); auto-expands if any year differs.

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
● = currently active year (highlighted with blue left-border)
```

- **Dates:** read-only, derived from contract dates
- **Seats / Unit Cost:** editable number inputs
- **Annual Cost:** auto-computed (`seats × unit_cost`), read-only
- **Active year indicator:** current year row highlighted — computed from today's date vs effective_from/to (frontend-only, no API call needed)
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
2. Set `entitlement.unit_cost`, `entitlement.annual_cost`, `entitlement.entitled_count` from the Year 1 schedule row

### Nightly Sync Job: `sync_active_pricing`

Runs inside the existing daily alert pass in `alert_generator.py`:

```python
async def sync_active_pricing(db):
    today = date.today()
    schedules = await db.execute(
        select(EntitlementPriceSchedule)
        .where(EntitlementPriceSchedule.effective_from <= today)
        .where(EntitlementPriceSchedule.effective_to >= today)
    )
    for sched in schedules.scalars():
        ent = await db.get(Entitlement, sched.ent_id)
        if not ent:
            continue
        changed = (
            ent.unit_cost != sched.unit_cost or
            ent.annual_cost != sched.annual_cost or
            ent.entitled_count != sched.entitled_count
        )
        if changed:
            ent.unit_cost = sched.unit_cost
            ent.annual_cost = sched.annual_cost
            ent.entitled_count = sched.entitled_count
    await db.commit()
```

This runs once per day, before alerts are generated, so all consumers read the correct current-year values during the same daily pass.

---

## 5. Consumers of Active Pricing

All three consumers read from `ent.unit_cost` / `ent.annual_cost` / `ent.entitled_count` — which the sync job keeps current. **No code changes required in any consumer.**

### Software Catalog (`catalog.py`)

Currently displays `unit_cost_inr` and `annual_cost_inr` from the entitlement. After the sync job runs on a year boundary, these automatically reflect the current year's pricing. The catalog detail view can optionally show the full price schedule table (read from `PriceScheduleOut`) as a collapsible "Multi-Year Schedule" section — informational only, no editing.

### Reconciliation Engine (`reconciliation_engine.py`)

Currently passes `ent.unit_cost` to the AI advisor context for recommendations (e.g., "idle 50 seats × ₹3,600 = ₹1,80,000 saving"). After sync, this correctly uses Year 2's unit cost when Year 2 is active — the AI recommendation and delta calculations stay accurate without modification.

### Cost Optimisation (`cost_opt.py`)

Currently computes:
- `est_saving = unit_cost × idle_seats` (UNDER_UTILISED)
- `est_saving = unit_cost × overage_seats` (OVER_DEPLOYED)
- `total_est_saving_inr` and `total_risk_exposure_inr` as sums

After sync, `unit_cost` on the entitlement is the active year's rate — savings and risk exposure figures automatically use the correct current pricing. The cost opt scorecard tiles and per-item rows reflect real current-year cost exposure.

---

## 6. Dashboard Metrics

Two metrics exposed for multi-year contracts (shown alongside existing totals):

| Metric | Source | Description |
|---|---|---|
| **Current Year Cost** | `entitlement.annual_cost` (synced) | What DRL pays in the active contract year |
| **Total Committed Value** | `SUM(annual_cost)` across all schedule rows | Full financial exposure over the contract term |

For single-year contracts, both metrics are equal and sourced from the existing entitlement columns — no change.

---

## 7. Pricing Change Alerts

### Trigger Condition

An alert fires when today falls within `renewal_alert_extra_days` days **before** the `effective_from` of any Year 2+ schedule row.

Example: `renewal_alert_extra_days = [30, 15, 7]`, Year 2 starts 2027-01-26 → alerts fire on 2026-12-27, 2027-01-11, 2027-01-19.

### Alert Payload

```
Type: PRICE_YEAR_CHANGE
Software: Microsoft 365 E3
Contract: EA-2026-MSFT-001
Transition: Year 1 → Year 2 on 26 Jan 2027

Seats:     500 → 550  (+50)
Unit Cost: ₹3,600 → ₹3,800  (+₹200/seat)
Annual Cost: ₹1,80,00,000 → ₹2,09,00,000  (↑ ₹29,00,000)
```

Sent to all DOA escalation contacts and the contract's Primary App Owner.

### Implementation in `alert_generator.py`

```python
for schedule in year2_plus_schedules:
    days_until = (schedule.effective_from - today).days
    if days_until in renewal_alert_extra_days:
        prev = get_prev_year_schedule(schedule)
        generate_price_change_alert(entitlement, schedule, prev)
```

The `sync_active_pricing` job and this alert check both run in the same daily pass, in order:
1. `sync_active_pricing` — update entitlement columns to active year
2. Alert checks — price change alerts, renewal alerts, over-deployment alerts

---

## 8. Migration Plan

| Migration | Description |
|---|---|
| `013_entitlement_price_schedules.py` | Create `entitlement_price_schedules` table with composite index |

No changes to existing columns. No data migration required for existing entitlements.

---

## 9. Files to Change

| File | Change |
|---|---|
| `backend/alembic/versions/013_entitlement_price_schedules.py` | New migration |
| `backend/app/models/contracts.py` | Add `EntitlementPriceSchedule` model |
| `backend/app/schemas/onboarding.py` | Add `PriceScheduleIn`, update `MultiLineItemIn` |
| `backend/app/schemas/entitlements.py` | Add `PriceScheduleOut` |
| `backend/app/api/v1/routes/onboarding.py` | Bulk-insert schedule rows in `multi_publish` |
| `backend/app/api/v1/routes/catalog.py` | Add optional schedule table to catalog detail view |
| `backend/app/services/alert_generator.py` | Add `sync_active_pricing` job + year-change alert |
| `frontend/src/pages/Onboarding/OnboardingPage.jsx` | Add `PriceScheduleTable` component to `LineItemCard` |
| `frontend/src/pages/Dashboard/` | Expose Total Committed Value metric |

**No changes required to:** `reconciliation_engine.py`, `cost_opt.py` — both automatically use correct pricing via the sync job.

---

## Out of Scope

- Mid-year pricing amendments (contract addendums) — separate flow
- Fiscal-year vs anniversary-year alignment — anniversary-based only
- Partial-year pro-ration on contract start
- Per-line-item alert interval overrides — all items inherit the contract's `renewal_alert_extra_days`
