# DRL SAM Platform — Database Schema

> **Database:** PostgreSQL 15 (Supabase local dev port 54322 · AWS RDS production)
> **Schema version:** Alembic migrations `001_initial_schema` → `002_entitlement_renewal`

---

## Table of Contents

1. [Entity Relationship Overview](#entity-relationship-overview)
2. [Core Tables](#core-tables)
3. [Masters / Reference Tables](#masters--reference-tables)
4. [Operational Tables](#operational-tables)
5. [Audit & Compliance Tables](#audit--compliance-tables)
6. [Upload Template Schemas](#upload-template-schemas)
7. [Gaps & Recommendations](#gaps--recommendations)

---

## Entity Relationship Overview

```
users ──────────────────────────────────────────────────────────────────────────────┐
  │                                                                                  │
  ├── software_catalog ──── categories / sub_categories                             │
  │       │                 vendors                                                  │
  │       │                 regions                                                  │
  │       └── software_aliases                                                       │
  │                                                                                  │
  ├── contracts ────────── software_catalog                                          │
  │       └── entitlements ─── license_metrics                                      │
  │               │             discovery_sources                                    │
  │               │             usage_update_methods                                 │
  │               │             regions                                              │
  │               └── renewal_of (self-referential FK)                              │
  │                                                                                  │
  ├── discovery_records ── software_catalog / discovery_sources / regions           │
  ├── reconciliation_runs → reconciliation_results → entitlements                   │
  ├── alerts → entitlements        alert_reads → alerts + users                     │
  ├── audit_trail                                                                    │
  ├── usage_uploads → entitlements                                                  │
  ├── onboarding_drafts                                                             │
  └── doa_hierarchy                                                                 │
                                                                                    │
users ──────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Tables

### `software_catalog`
Master catalog of all software titles. One canonical entry per unique software product.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `sw_id` | VARCHAR(20) | NOT NULL | **PK** — format `SW-001`, auto-incremented |
| `canonical_name` | VARCHAR(255) | NOT NULL | Unique standardised name across the platform |
| `publisher` | VARCHAR(200) | nullable | Vendor / publisher name |
| `category_id` | UUID | nullable | FK → `categories.id` |
| `sub_category_id` | UUID | nullable | FK → `sub_categories.id` |
| `gxp_flag` | ENUM | NOT NULL | `no` / `yes_21cfr` / `yes_annex11` / `yes_both` · displayed as GxP/Non-GxP |
| `vendor_id` | UUID | nullable | FK → `vendors.id` |
| `vendor_risk` | ENUM | NOT NULL | `LOW` / `MEDIUM` / `HIGH` |
| `deployment` | ENUM | NOT NULL | `cloud` / `on_premise` / `desktop_cloud` / `hybrid` |
| `region_id` | UUID | nullable | FK → `regions.id` |
| `app_owner_id` | UUID | nullable | FK → `users.id` |
| `notes` | TEXT | nullable | Business description / use of software |
| `onboarded_date` | DATE | nullable | Date added to catalog |
| `created_by` | UUID | nullable | FK → `users.id` |

### `software_aliases`
Alternative names for a software title (SCCM names, discovery source names, PO names).

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID | NOT NULL | **PK** |
| `sw_id` | VARCHAR(20) | NOT NULL | FK → `software_catalog.sw_id` (cascade delete) |
| `alias_name` | VARCHAR(255) | NOT NULL | The alternative name |
| `source_name` | VARCHAR(100) | nullable | Origin: `onboarding` / `manual` / discovery tool name |

---

### `contracts`
One contract per purchase agreement. A contract belongs to one `sw_id` (primary SW). Multiple entitlements can link to the same contract.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID | NOT NULL | **PK** |
| `sw_id` | VARCHAR(20) | NOT NULL | FK → `software_catalog.sw_id` (primary SW for this contract) |
| `po_number` | VARCHAR(100) | nullable | Purchase Order number |
| `clm_id` | VARCHAR(100) | nullable | Contract Lifecycle Management ID |
| `vendor_id` | UUID | nullable | FK → `vendors.id` |
| `reseller` | VARCHAR(200) | nullable | Reseller / distributor name |
| `start_date` | DATE | nullable | Contract effective date |
| `end_date` | DATE | nullable | Contract expiry date — drives renewal alerts |
| `total_value_inr` | BIGINT | nullable | Total contract value in INR |
| `auto_renewal_clause` | ENUM | nullable | `yes` / `no` / `opt_in` |
| `file_name` | VARCHAR(255) | nullable | Original uploaded filename |
| `file_path` | VARCHAR(500) | nullable | Storage path (Supabase or S3) |
| `storage_backend` | ENUM | NOT NULL | `local` / `supabase` / `s3` |
| `is_archived` | BOOLEAN | NOT NULL | True after contract is superseded |
| `archived_at` | TIMESTAMP | nullable | When archived |
| `archived_path` | VARCHAR(500) | nullable | Archive storage path |
| `created_by` | UUID | nullable | FK → `users.id` |
| `created_at` | TIMESTAMP | NOT NULL | Auto-set on insert |

---

### `entitlements`
One entitlement record per software line item per contract. This is the primary operational record for license counts, costs, and utilisation.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `ent_id` | VARCHAR(20) | NOT NULL | **PK** — format `ENT-001`, auto-incremented |
| `sw_id` | VARCHAR(20) | NOT NULL | FK → `software_catalog.sw_id` |
| `contract_id` | UUID | nullable | FK → `contracts.id` |
| `contract_name` | VARCHAR(255) | nullable | Name as written in the contract document |
| `metric_id` | UUID | nullable | FK → `license_metrics.id` |
| `license_type` | ENUM | NOT NULL | `subscription` / `perpetual` |
| `entitled_count` | BIGINT | nullable | Total licensed seats/units purchased |
| `in_use_count` | BIGINT | nullable | Current active usage (updated via template upload) |
| `unit_cost_inr` | BIGINT | nullable | Cost per seat/unit in INR |
| `annual_cost_inr` | BIGINT | nullable | Total annual cost in INR |
| `region_id` | UUID | nullable | FK → `regions.id` |
| `discovery_source_id` | UUID | nullable | FK → `discovery_sources.id` |
| `usage_method_id` | UUID | nullable | FK → `usage_update_methods.id` |
| `app_owner_id` | UUID | nullable | FK → `users.id` |
| `status` | ENUM | NOT NULL | `ACTIVE` / `EXPIRED` / `WATCH` / `OVER_DEPLOYED` / `UNDER_UTILISED` / `OK` |
| `renewal_of` | VARCHAR(20) | nullable | FK → `entitlements.ent_id` (self-ref — links renewal chain) |
| `last_updated` | TIMESTAMP | NOT NULL | Auto-updated on any change |

---

### `discovery_records`
Device-level software usage records ingested from SCCM, EDR, CMDB, or manual uploads.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `disc_id` | VARCHAR(20) | NOT NULL | **PK** — format `D-0001`, auto-incremented |
| `contract_name` | VARCHAR(255) | NOT NULL | As reported by discovery tool |
| `sw_id` | VARCHAR(20) | nullable | FK → `software_catalog.sw_id` — null if unmatched |
| `canonical_name` | VARCHAR(255) | nullable | Resolved canonical name |
| `application_tagged` | VARCHAR(255) | nullable | Application tag from discovery source |
| `source_id` | UUID | nullable | FK → `discovery_sources.id` |
| `device_id` | VARCHAR(100) | nullable | Hostname / device identifier |
| `device_type` | ENUM | nullable | `endpoint` / `server` |
| `os` | VARCHAR(100) | nullable | Operating system |
| `version` | VARCHAR(50) | nullable | Software version detected |
| `last_seen` | DATE | nullable | Last date the software was detected on the device |
| `site` | VARCHAR(100) | nullable | Physical or network site |
| `region_id` | UUID | nullable | FK → `regions.id` |
| `upload_date` | DATE | nullable | Date the record was ingested |
| `upload_batch_id` | UUID | nullable | Groups records from the same upload |

---

### `onboarding_drafts`
Auto-saved wizard state for in-progress onboarding sessions.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID | NOT NULL | **PK** |
| `user_id` | UUID | NOT NULL | FK → `users.id` |
| `po_number` | VARCHAR(100) | nullable | Quick identifier for the draft |
| `form_data_json` | JSONB | nullable | Full wizard form state serialised as JSON |
| `current_step` | INTEGER | NOT NULL | Last active step (1–6) |
| `created_at` | TIMESTAMP | NOT NULL | — |
| `updated_at` | TIMESTAMP | NOT NULL | Auto-updated on save |

---

## Masters / Reference Tables

### `categories`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `name` | VARCHAR(100) UNIQUE | e.g. "Enterprise Productivity" |
| `gxp_applicable` | ENUM | `no` / `yes` / `mixed` |
| `created_at` | TIMESTAMP | — |

### `sub_categories`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `category_id` | UUID FK → categories | — |
| `name` | VARCHAR(100) | e.g. "PDF Management" |

### `vendors`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `name` | VARCHAR(200) UNIQUE | e.g. "SAP SE" |
| `audit_risk` | ENUM | `LOW` / `MEDIUM` / `HIGH` |
| `last_audit_date` | VARCHAR(20) | ISO date string |
| `notes` | TEXT | — |

### `license_metrics`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `name` | VARCHAR(100) UNIQUE | e.g. "Per User", "Per Device", "Core" |
| `description` | TEXT | — |
| `how_to_count` | TEXT | Instructions for usage measurement |

### `discovery_sources`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `name` | VARCHAR(100) UNIQUE | e.g. "SCCM", "CrowdStrike EDR" |
| `type` | ENUM | `agent` / `cmdb` / `edr` / `network` / `manual` / `casb` / `api` |
| `coverage` | TEXT | Description of what/where it covers |
| `frequency` | VARCHAR(50) | e.g. "Daily", "Monthly" |
| `contact` | VARCHAR(200) | Owner / contact person |
| `status` | ENUM | `active` / `inactive` / `stale` |
| `notes` | TEXT | — |

### `usage_update_methods`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `name` | VARCHAR(100) UNIQUE | e.g. "Monthly Template Upload" |
| `description` | TEXT | — |
| `template_required` | ENUM | `none` / `tab_a` / `tab_a_and_b` |

### `regions`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `name` | VARCHAR(100) UNIQUE | e.g. "Global", "India", "EU" |
| `sites_json` | TEXT | JSON array of site names |
| `regulatory_zone` | VARCHAR(200) | e.g. "21 CFR Part 11" |
| `data_residency` | VARCHAR(100) | e.g. "India" |
| `aws_region` | VARCHAR(50) | e.g. "ap-south-1" |

---

## Operational Tables

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `email` | VARCHAR(255) UNIQUE INDEX | Login identifier |
| `full_name` | VARCHAR(255) NOT NULL | — |
| `hashed_password` | VARCHAR(255) | Argon2id hash · null for SSO-only users |
| `role` | ENUM | `COE_ADMIN` / `APP_OWNER` / `READ_ONLY` |
| `bu` | VARCHAR(100) | Business unit |
| `region_id` | UUID FK → regions | User's home region |
| `is_active` | BOOLEAN | Soft-delete flag |
| `sso_sub` | VARCHAR(255) UNIQUE | SAML subject identifier (production SSO) |
| `created_at` | TIMESTAMP | — |
| `updated_at` | TIMESTAMP | — |

### `doa_hierarchy`
Delegation of Authority — defines who receives alerts and approvals.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `user_id` | UUID FK → users | NOT NULL |
| `tier` | ENUM | `1` (CIO/Head) / `2` (Manager) |
| `role_label` | VARCHAR(100) | Display label: "CIO", "COE Head", "Procurement" |
| `alert_scope` | VARCHAR(100) | e.g. "All · T-30+ · GxP" |
| `software_categories_json` | TEXT | JSON array of category IDs this person covers |
| `created_at` / `updated_at` | TIMESTAMP | — |

### `alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `alert_type` | ENUM | `RENEWAL` / `UTILISATION` |
| `ent_id` | VARCHAR(20) FK → entitlements | nullable |
| `severity` | ENUM | `CRITICAL` / `HIGH` / `MEDIUM` / `INFO` |
| `days_to_expiry` | INTEGER | For RENEWAL alerts |
| `title` | VARCHAR(500) NOT NULL | Alert headline |
| `body_json` | JSONB | Structured payload: ent_id, sw_name, end_date, util_pct, etc. |
| `is_gxp` | BOOLEAN | GxP-flagged software alert |
| `created_at` | TIMESTAMP | — |

### `alert_reads`
Per-user read tracking (avoids read-state on the alert itself).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `alert_id` | UUID FK → alerts | NOT NULL |
| `user_id` | UUID FK → users | NOT NULL |
| `read_at` | TIMESTAMP | — |

### `reconciliation_runs`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `run_date` | TIMESTAMP | When the run was triggered |
| `triggered_by` | UUID FK → users | null = APScheduler automated run |
| `entitlements_processed` | INTEGER | Count of entitlements evaluated |

### `reconciliation_results`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `run_id` | UUID FK → reconciliation_runs | NOT NULL |
| `ent_id` | VARCHAR(20) FK → entitlements | NOT NULL |
| `entitled` | NUMERIC | Snapshot of entitled_count at run time |
| `in_use` | NUMERIC | Snapshot of in_use_count at run time |
| `util_pct` | NUMERIC | Calculated: `(in_use / entitled) × 100` |
| `status` | ENUM | `OVER_DEPLOYED` / `WATCH` / `OK` / `UNDER_UTILISED` |
| `ai_recommendation` | TEXT | GPT-4o recommendation text |
| `generated_at` | TIMESTAMP | — |

### `usage_uploads`
Audit trail for every XLSX file uploaded via the Entitlements page.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `user_id` | UUID FK → users | NOT NULL — who uploaded |
| `ent_id` | VARCHAR(20) FK → entitlements | nullable |
| `file_name` | VARCHAR(255) NOT NULL | Original filename |
| `file_hash` | VARCHAR(64) NOT NULL | SHA-256 — deduplication + tamper evidence |
| `file_path` | VARCHAR(500) NOT NULL | Storage path |
| `storage_backend` | ENUM | `local` / `supabase` / `s3` |
| `reporting_period` | VARCHAR(50) | e.g. "April 2026" |
| `reason` | TEXT | Reason for update |
| `processed_at` | TIMESTAMP | When processing completed |
| `status` | ENUM | `pending` / `processing` / `completed` / `failed` |
| `error_details` | TEXT | Parser errors if any |
| `previous_upload_archived_to` | VARCHAR(500) | S3 path of previous file |
| `created_at` | TIMESTAMP | — |

---

## Audit & Compliance Tables

### `audit_trail`
GxP 21 CFR Part 11 compliant append-only log. **No UPDATE or DELETE operations permitted.**

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `user_id` | UUID FK → users | nullable (system actions) |
| `action_type` | VARCHAR(100) NOT NULL | `CATALOG_CREATED` / `CATALOG_UPDATED` / `ENTITLEMENT_UPDATED` / `SOFTWARE_ONBOARDED` / `RECONCILIATION_RUN` / `ENTITLEMENT_RENEWED` |
| `entity_type` | VARCHAR(100) NOT NULL | `software_catalog` / `entitlement` / `reconciliation_run` |
| `entity_id` | VARCHAR(100) | SW_ID or ENT_ID of the affected record |
| `sw_id` | VARCHAR(20) | Denormalised SW_ID for fast filtering |
| `before_values_json` | JSONB | State before the change |
| `after_values_json` | JSONB | State after the change |
| `reason_for_change` | TEXT | Free-text reason |
| `file_hash` | VARCHAR(64) | SHA-256 of associated file if applicable |
| `is_gxp` | BOOLEAN | True if the affected record is GxP-relevant |
| `session_id` | VARCHAR(100) | Session identifier |
| `ip_address` | VARCHAR(45) | IPv4 or IPv6 |
| `created_at_utc` | TIMESTAMP NOT NULL | UTC timestamp — immutable |
| `is_archived` | BOOLEAN | True when moved to long-term archive |
| `archived_path` | VARCHAR(500) | Archive storage path |

---

## Upload Template Schemas

### Template 1 — `DRL_LicenseUsage_Template_v3.xlsx`
Used for bulk entitlement updates and license discovery data.
**Download from:** Entitlements page → Download button

#### Tab A — Entitlement Update

| # | Column | Editable | Format | Required | Notes |
|---|---|---|---|---|---|
| 1 | ENT_ID | 🔒 Locked | `ENT-001` | — | Lookup key |
| 2 | SW_ID | 🔒 Locked | `SW-001` | — | Lookup / validation |
| 3 | Canonical Name | 🔒 Locked | Text | — | Reference only |
| 4 | Metric | 🔒 Locked | Text | — | Reference only |
| 5 | Current Status | 🔒 Locked | ENUM | — | Reference only |
| 6 | PO Number | 🔒 Locked | Text | — | From linked contract |
| 7 | Contract Name | ✏️ Editable | Text | — | As in contract |
| 8 | License Type | ✏️ Editable | `subscription` / `perpetual` | — | Lowercase only |
| 9 | Entitled Count | ✏️ Editable | Integer | — | Total licensed seats |
| 10 | In-Use Count | ✏️ Editable | Integer | — | Current active usage |
| 11 | Unit Cost (INR) | ✏️ Editable | Integer | — | Cost per seat |
| 12 | Annual Cost (INR) | ✏️ Editable | Integer | — | Total annual cost |
| 13 | Notes | ✏️ Editable | Text | — | Free text |

**Lookup logic:** ENT_ID (primary) → SW_ID (fallback if ENT_ID blank). If SW_ID has multiple entitlements, ENT_ID is required to disambiguate.

#### Tab B — License Discovery

| # | Column | Editable | Format | Required | Notes |
|---|---|---|---|---|---|
| 1 | ENT_ID | 🔒 Locked | `ENT-001` | — | Reference |
| 2 | SW_ID | 🔒 Locked | `SW-001` | — | Reference |
| 3 | Contract Software Name | 🔒 Locked | Text | — | Reference |
| 4 | Application Tagged | ✏️ Editable | Text | — | Discovery tool tag |
| 5 | Data Source | ✏️ Editable | Text | — | e.g. "SCCM", "CrowdStrike" |
| 6 | Device Type | ✏️ Editable | `endpoint` / `server` | — | Lowercase |
| 7 | Device ID | ✏️ Editable | Text | — | Hostname / asset ID |
| 8 | OS | ✏️ Editable | Text | — | e.g. "Windows 11" |
| 9 | Version | ✏️ Editable | Text | — | e.g. "16.0.17" |
| 10 | Last Seen (YYYY-MM-DD) | ✏️ Editable | `YYYY-MM-DD` | — | ISO date format |
| 11 | Region | ✏️ Editable | Text | — | e.g. "India", "Global" |

**Upload supported from:** Entitlements page **or** License Discovery page.

---

### Template 2 — `DRL_BulkOnboarding_Template.xlsx`
Used to create multiple software + contract + entitlement records in one pass.
**Download from:** Onboard Software → Bulk Upload → Download Template

#### Single Sheet — Bulk Onboarding

| # | Column | Required | Format | Notes |
|---|---|---|---|---|
| 1 | Software Name * | **YES** | Text | Canonical name. If matches existing → maps to it. New name → new SW_ID |
| 2 | SW_ID (leave blank=new) | No | `SW-001` | Provide to map to specific existing SW |
| 3 | Publisher | No | Text | Vendor / publisher name |
| 4 | Category | No | Text | Must match a master category name (case-insensitive) |
| 5 | Deployment | No | `cloud` / `on_premise` / `desktop_cloud` / `hybrid` | Default: `cloud` |
| 6 | GxP Relevant (yes/no) | No | `yes` / `no` | Default: `no` |
| 7 | Vendor Risk (LOW/MEDIUM/HIGH) | No | `LOW` / `MEDIUM` / `HIGH` | Default: `LOW` |
| 8 | Notes | No | Text | Business description |
| 9 | Contract Name * | **YES** | Text | Line item name as in contract |
| 10 | PO Number | No | Text | Purchase Order number |
| 11 | CLM ID | No | Text | Contract Lifecycle Management ID |
| 12 | Start Date (YYYY-MM-DD) | No | `YYYY-MM-DD` | ISO date format |
| 13 | End Date (YYYY-MM-DD) | No | `YYYY-MM-DD` | ISO date format — drives renewal alerts |
| 14 | Total Value (INR) | No | Integer | Total contract value |
| 15 | Auto-Renewal (yes/no/opt_in) | No | `yes` / `no` / `opt_in` | — |
| 16 | License Type (subscription/perpetual) | No | `subscription` / `perpetual` | Default: `subscription` |
| 17 | Metric | No | Text | Must match a master metric name (case-insensitive) |
| 18 | Entitled Count | No | Integer | Total licensed seats/units |
| 19 | Unit Cost (INR) | No | Integer | Cost per seat |
| 20 | Annual Cost (INR) | No | Integer | Total annual cost |

---

## Gaps & Recommendations

### 🔴 Critical Gaps

| # | Gap | Impact | Recommendation |
|---|---|---|---|
| 1 | **`software_catalog.canonical_name` is UNIQUE** — contract renewal creates a duplicate canonical name (new SW_ID, same name) | Bulk onboarding maps to existing instead of creating new | Consider adding `onboarded_date` version tracking or a `is_current` flag to allow versioned catalog entries |
| 2 | **`doa_hierarchy` missing `escalation_level` field** — the API returns `role_label` but the field name caused a bug in the UI | DOA pills displayed blank | ✅ Fixed in code (`d.role_label`). Schema lacks a formalised `escalation_level` column consistent with the display |
| 3 | **No `vendor_id` on `entitlements`** — only on `contracts` and `software_catalog` | Cannot filter entitlements by vendor directly | Add `vendor_id` FK on `entitlements` OR expose it via the join in the API |

### 🟡 Recommended Improvements

| # | Gap | Impact | Recommendation |
|---|---|---|---|
| 4 | **`discovery_records` has no `version` field tracked over time** — each upload creates new records, old ones are not marked stale/superseded | Cannot see trend of in-use over time | Add `is_current BOOLEAN` + `superseded_at TIMESTAMP` to allow point-in-time queries |
| 5 | **`entitlements.annual_cost_inr` is not auto-calculated from `entitled_count × unit_cost_inr`** — stored explicitly | Inconsistency if unit cost changes | Add a DB trigger or enforce auto-calc in the upload processor |
| 6 | **Bulk Onboarding Template missing `Sub-Category`** — only `Category` is in the template | Sub-category cannot be set via bulk upload | Add column 4b: `Sub-Category` to the bulk template |
| 7 | **Bulk Onboarding Template missing `Region`** — deployment region per software cannot be set | Region defaults to null | Add `Region` column to bulk onboarding template |
| 8 | **`contracts` table has no `clm_reference_url`** — only `clm_id` text | Cannot deep-link to the CLM system | Add `clm_url VARCHAR(500)` column for direct links to contract documents in the CLM system |
| 9 | **`usage_uploads.ent_id` is nullable** — a single upload processes many entitlements but only records one | Upload history is not per-entitlement | Consider a `usage_upload_entitlements` junction table to link one upload to many ENT_IDs |
| 10 | **No `AppOwnerHierarchy` (secondary owner)** — only `app_owner_id` on `software_catalog` | Cannot store secondary owner | Add `secondary_owner_id UUID FK → users` on `software_catalog` (UI already shows this field) |
| 11 | **`reconciliation_results` stores snapshots but `entitlements` are mutable** — no immutable history of `entitled_count` changes | Cannot reconstruct historical utilisation | ✅ Reconciliation results store snapshots at run time — but no general change history table exists for entitlement counts |
| 12 | **Tab B (License Discovery) does not capture `site`** — the `discovery_records.site` column exists but there is no `Site` column in the template | Site-level filtering impossible after bulk upload | Add `Site` column to Tab B of the usage template |

### 🟢 Already Handled

- ✅ Append-only audit trail with `before_values_json` / `after_values_json` (GxP 21 CFR Part 11)
- ✅ Contract renewal chain via `entitlements.renewal_of` self-referential FK
- ✅ File deduplication via `file_hash` SHA-256 in `usage_uploads`
- ✅ Soft-delete on users (`is_active`) preserving FK integrity
- ✅ Storage backend abstraction (`local` / `supabase` / `s3`) on both `contracts` and `usage_uploads`
- ✅ Per-user read tracking on alerts (separate `alert_reads` table, not a flag on `alerts`)
