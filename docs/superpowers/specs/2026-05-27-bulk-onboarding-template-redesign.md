# Bulk Onboarding Template Redesign — Two-Tab XLSX

## Goal

Replace the single-sheet bulk onboarding template with a two-tab XLSX workbook that mirrors the five-step onboarding UI. Tab 1 holds contract-level information (Steps 1–2). Tab 2 holds one row per software line item (Steps 3–5). Both tabs highlight mandatory columns in amber/red and provide data-validated dropdowns for every constrained field.

## Architecture

**One contract per file.** Tab 1 has exactly one data row. Tab 2 has one row per software title on that contract. A hidden `_Lists` sheet is populated at download time with live values from the DB for dynamic dropdowns (regions, categories, metrics, etc.). Static short lists use inline validation strings.

The backend `bulk_onboard` endpoint is refactored to parse both tabs and delegate to the existing `multi_publish` logic, eliminating duplicate catalog/entitlement creation code.

**Tech stack:** Python `openpyxl` (already a dependency), FastAPI async endpoint, existing `multi_publish` service.

---

## File Structure

| File | Change |
|------|--------|
| `backend/app/services/uploads/xlsx_processor.py` | No change (Tab A/B used by entitlement update flow, untouched) |
| `backend/app/api/v1/routes/onboarding.py` | Replace `_generate_bulk_template()` and `_parse_bulk_xlsx()` with new two-tab versions; refactor `bulk_onboard` endpoint to call `multi_publish` internally |

---

## Tab 1 — Contract Information

**Sheet name:** `Contract Information`

### Layout

- Row 1: Column headers (styled)
- Row 2: Example row (italic grey)
- Row 3: Single data row (user fills this)

### Columns

| # | Header | Required | Validation |
|---|--------|----------|------------|
| A | Vendor / Publisher Name | ✱ | Free text |
| B | PO Number | ✱ | Free text |
| C | Contract Name | ✱ | Free text |
| D | Contract Start Date | ✱ | Date ≥ 2000-01-01, format YYYY-MM-DD |
| E | Contract End Date | ✱ | Date ≥ 2000-01-01, must be after Start Date |
| F | CLM ID | — | Free text |
| G | Auto-Renewal Clause | — | List: `yes, no, opt_in` |
| H | Currency | — | List: `INR, USD, EUR, GBP, JPY, CHF, AUD, CAD, SGD, AED` (defaults to INR in example) |

---

## Tab 2 — Contract Line Items

**Sheet name:** `Contract Line Items`

### Layout

- Row 1: Section label row — thin coloured bands spanning groups of columns, labelling "Step 3 — Software & Licensing", "Step 4 — Owner & DOA", "Step 5 — Source & Usage Config"
- Row 2: Column headers (styled, mandatory = amber, optional = navy)
- Row 3: Example row (italic grey)
- Row 4+: Data rows (user fills these)

### Columns

**Step 3 — Software & Licensing (columns A–O)**

| # | Header | Required | Validation |
|---|--------|----------|------------|
| A | Software Name | ✱ | Free text; matched against catalog on upload |
| B | SW_ID | — | Free text; leave blank to auto-assign |
| C | License Type | ✱ | List → `_Lists!$A` (DB: `license_types.license_type`) |
| D | Metric | ✱ | List → `_Lists!$B` (DB: `license_metrics.name`) |
| E | Entitled Count | ✱ | Whole number ≥ 1 |
| F | Unit Cost | ✱ | Whole number ≥ 0 |
| G | Annual Cost | — | Whole number ≥ 0; auto-calc (Entitled × Unit Cost) if blank during parse |
| H | Business Unit(s) | ✱ | List → `_Lists!$C` (static BIZ_UNITS); comma-separate for multiple |
| I | Region(s) | ✱ | List → `_Lists!$D` (DB: `regions.name`); comma-separate for multiple |
| J | Category | — | List → `_Lists!$E` (DB: `categories.name`) |
| K | Sub-Category | — | List → `_Lists!$F` (DB: `sub_categories.name`) |
| L | GxP Flag | — | List: `no, yes_21cfr, yes_annex11, yes_both` |
| M | Vendor Audit Risk | — | List: `LOW, MEDIUM, HIGH` |
| N | Deployment | — | List: `cloud, on_premise, desktop_cloud, hybrid` |
| O | Notes | — | Free text |

**Step 4 — Owner & DOA (columns P–R)**

| # | Header | Required | Validation |
|---|--------|----------|------------|
| P | App Owner Email | — | Free text; resolved to user.id on upload |
| Q | Secondary Owner Email | — | Free text; resolved to user.id on upload |
| R | DOA Contact Email(s) | — | Free text; comma-separated; each resolved to doa_hierarchy.id |

**Step 5 — Source & Usage Config (columns S–T)**

| # | Header | Required | Validation |
|---|--------|----------|------------|
| S | Discovery Source | — | List → `_Lists!$G` (DB: `discovery_sources.name`) |
| T | Usage Update Method | — | List → `_Lists!$H` (DB: `usage_update_methods.name`) |

---

## _Lists Hidden Sheet

**Sheet name:** `_Lists`  
**Sheet state:** `hidden`  
**Populated at download time** by querying the DB.

| Column | Content | Source |
|--------|---------|--------|
| A | License types | `SELECT license_type FROM license_types ORDER BY license_type` |
| B | Metrics | `SELECT name FROM license_metrics ORDER BY name` |
| C | Business units | Static `BIZ_UNITS` constant (22 values) |
| D | Regions | `SELECT name FROM regions ORDER BY name` |
| E | Categories | `SELECT name FROM categories ORDER BY name` |
| F | Sub-categories | `SELECT name FROM sub_categories ORDER BY name` |
| G | Discovery sources | `SELECT name FROM discovery_sources ORDER BY name` |
| H | Usage update methods | `SELECT name FROM usage_update_methods ORDER BY name` |

Each column has a plain-text header in row 1 (e.g., "LicenseTypes") and values from row 2 downward. DataValidation formulas reference `_Lists!$A$2:$A$100` (sufficiently long range; blank cells at the end are ignored by Excel).

---

## Visual Styling

### Header colours

| Type | Fill | Font |
|------|------|------|
| Mandatory column | `#C0392B` (dark red) | White, bold, size 10 |
| Optional column | `#1A2E5A` (DRL navy) | White, bold, size 10 |
| Section label row (Tab 2 row 1) | `#2C3E50` (dark slate) | White, bold, size 9, italic |

### Example row

- Italic, grey (`#888888`), size 9
- Shows a valid complete example for every column
- Tab 1 example: `TechCorp Systems | PO-2026-001 | TechCorp Enterprise Suite FY26 | 2026-04-01 | 2027-03-31 | CLM-2026-001 | yes | INR`
- Tab 2 example: `TechCorp ERP | (blank) | subscription | Per User | 500 | 8000 | 4000000 | IT | GG India | ERP & Supply Chain | ERP | yes_21cfr | MEDIUM | cloud | Core ERP module | owner@drl.com | (blank) | (blank) | SCCM (Microsoft MECM) | Monthly Template Upload (XLSX)`

### Column widths

- Auto-sized to `max(len(header), 14) + 4` characters
- Notes and Email columns: minimum 30 chars wide

### Row heights

- Header rows: 22px
- Example row: 18px
- Data rows: default

---

## Backend: Template Generator

`_generate_bulk_template(db_lists: dict) -> bytes`

Signature changes: accepts a `db_lists` dict with keys `license_types`, `metrics`, `regions`, `categories`, `sub_categories`, `discovery_sources`, `usage_methods` (each a list of strings fetched from the DB before calling this function).

Steps:
1. Create workbook
2. Build `_Lists` hidden sheet — write each list into its column, set sheet state to hidden
3. Build `Contract Information` sheet — write headers with styling, add example row, apply DataValidation to row 3
4. Build `Contract Line Items` sheet — write section label row (row 1), write headers (row 2), add example row (row 3), apply DataValidation to rows 4:1000
5. Save to `BytesIO` and return bytes

The `download_bulk_template` endpoint queries the DB for all eight list types before calling the generator.

---

## Backend: Parser

`_parse_bulk_two_tab(data: bytes) -> tuple[dict, list[dict]]`

Returns `(contract_meta, line_items)`.

**contract_meta** — from Tab 1 row 3:
```python
{
  "vendor_name": str,
  "po_number": str,
  "contract_name": str,
  "start_date": date | None,
  "end_date": date | None,
  "clm_id": str | None,
  "auto_renewal_clause": str | None,   # "yes" | "no" | "opt_in" | None
  "currency": str,                      # default "INR"
}
```

**line_items** — from Tab 2 rows 4+, one dict per non-blank row:
```python
{
  "primary_sw_name": str,
  "sw_id": str | None,
  "license_type_name": str | None,
  "metric_name": str | None,
  "entitled_count": int | None,
  "unit_cost": int | None,
  "annual_cost": int | None,
  "business_units": list[str],
  "regions": list[str],
  "category_name": str | None,
  "sub_category_name": str | None,
  "gxp_flag": str,                 # default "no"
  "vendor_risk": str,              # default "LOW"
  "deployment": str,               # default "cloud"
  "notes": str | None,
  "app_owner_email": str | None,
  "secondary_owner_email": str | None,
  "doa_emails": list[str],
  "discovery_source_name": str | None,
  "usage_method_name": str | None,
}
```

Multi-value fields (business_units, regions, doa_emails) are split on comma and stripped.

---

## Backend: bulk_onboard Endpoint — Parse and Return

`POST /bulk` is **no longer a publish action**. It parses the uploaded XLSX and returns structured data in the same shape as the AI extraction response (`POST /extract`). Publishing is always done via the regular `POST /multi-publish` after the user reviews in the form.

**Old flow:** upload → parse → publish → return result  
**New flow:** upload → parse → return extracted data → user reviews in form → user publishes

### Response schema

```python
{
  "vendor_name": str | None,
  "po_number": str | None,
  "contract_name": str | None,
  "start_date": str | None,        # ISO date string "YYYY-MM-DD"
  "end_date": str | None,
  "clm_id": str | None,
  "auto_renewal_clause": str | None,
  "currency": str,                  # default "INR"
  "line_items": [
    {
      "contract_name": str | None,  # copied from contract_meta.contract_name
      "primary_sw_name": str,
      "sw_id": str | None,
      "license_type": str | None,   # name string (frontend resolves to ID, same as AI extraction)
      "metric_name": str | None,    # name string (frontend resolves to ID)
      "entitled_count": int | None,
      "unit_cost": int | None,
      "annual_cost": int | None,
      "business_units": list[str],
      "regions": list[str],
      "category_name": str | None,  # name string (frontend resolves to ID)
      "sub_category_name": str | None,
      "gxp_flag": str,
      "vendor_risk": str,
      "deployment": str,
      "notes": str | None,
      "app_owner_email": str | None,
      "secondary_owner_email": str | None,
      "doa_emails": list[str],
      "discovery_source_name": str | None,
      "usage_method_name": str | None,
    }
  ]
}
```

No DB writes happen in this endpoint. All name fields (license_type, metric, category, etc.) are returned as plain strings — the frontend already has this resolution logic from the AI extraction flow.

---

## Frontend: Bulk Upload Populates the Onboarding Form

The existing `useEffect` that maps `extracted` → form state (meta + line items) is extended to also handle the richer bulk-upload response. When `POST /bulk` succeeds, its response is set as `extracted` — the same state variable the AI extraction result populates — so the existing mapping logic runs unchanged.

**Additional fields resolved by the frontend** (same as AI extraction flow):
- `license_type` name → `licenseTypeId` UUID via match against loaded `licenseTypes`
- `metric_name` → `metricId` UUID via match against loaded `metrics`
- `category_name` → `categoryId` UUID via match against loaded `categories`
- `sub_category_name` → `subCategoryId` UUID via match against loaded `subCategories`

**New fields resolved by the frontend** (not in AI extraction, added here):
- `app_owner_email` → `appOwnerId` UUID via match against loaded `owners`
- `discovery_source_name` → `discoverySourceId` UUID via match against loaded `sources`
- `usage_method_name` → `usageMethodId` UUID via match against loaded `methods`
- `business_units` and `regions` are already string arrays — set directly

After population the user sees all extracted line items in the review form, can edit any field, then clicks Publish.

---

## Backward Compatibility

The old single-sheet `_parse_bulk_xlsx` function is removed. The `_generate_bulk_template` function is replaced. The endpoint path `/bulk-template` (GET) and `/bulk` (POST) are unchanged. Any existing uploaded files in the old format will fail validation at parse time with a clear error: `"Sheet 'Contract Information' not found — please download the latest template"`.

---

## Out of Scope

- Price schedule (multi-year) rows in the bulk template — complex enough to warrant a separate feature
- Sheet protection / password locking — not needed for internal use
- `.xls` legacy format support for the new template — new downloads are always `.xlsx`
