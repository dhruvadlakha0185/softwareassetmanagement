# DRL SAM Platform — Database Schema

> **Database:** PostgreSQL 15 (Supabase local dev port 54322 · AWS RDS production)
> **Schema version:** Alembic migrations `001_initial_schema` → `002_entitlement_renewal` → `003_schema_fixes`
>
> Migration 003 applied on 2026-05-19 — resolves 9 schema gaps identified in review.

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
  │       │                 app_owner (users) / secondary_owner (users)  ← NEW      │
  │       └── software_aliases                                                       │
  │                                                                                  │
  ├── contracts ────────── software_catalog                                          │
  │       └── entitlements ─── license_metrics                                      │
  │               │             discovery_sources                                    │
  │               │             usage_update_methods                                 │
  │               │             regions                                              │
  │               │             vendors  ← NEW                                       │
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
Master catalog of all software titles. Multiple entries may share the same `canonical_name` when a contract is renewed (different `sw_id` + `onboarded_date`).

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `sw_id` | VARCHAR(20) | NOT NULL | **PK** — format `SW-001`, auto-incremented |
| `canonical_name` | VARCHAR(255) | NOT NULL | Standardised name — no longer unique (renewal versioning) |
| `publisher` | VARCHAR(200) | nullable | Vendor / publisher name |
| `category_id` | UUID | nullable | FK → `categories.id` |
| `sub_category_id` | UUID | nullable | FK → `sub_categories.id` |
| `gxp_flag` | ENUM | NOT NULL | `no` / `yes_21cfr` / `yes_annex11` / `yes_both` · displayed as GxP/Non-GxP |
| `vendor_id` | UUID | nullable | FK → `vendors.id` |
| `vendor_risk` | ENUM | NOT NULL | `LOW` / `MEDIUM` / `HIGH` |
| `deployment` | ENUM | NOT NULL | `cloud` / `on_premise` / `desktop_cloud` / `hybrid` |
| `region_id` | UUID | nullable | FK → `regions.id` |
| `app_owner_id` | UUID | nullable | FK → `users.id` — primary application owner |
| `secondary_owner_id` | UUID | nullable | **NEW (003)** FK → `users.id` — secondary / backup owner |
| `notes` | TEXT | nullable | Business description / use of software |
| `onboarded_date` | DATE | nullable | Date added to catalog — used with `canonical_name` to distinguish renewal vintages |
| `created_by` | UUID | nullable | FK → `users.id` |

> **Renewal versioning:** When a contract is renewed, `POST /onboarding/multi-publish` creates a new `sw_id` with the same `canonical_name` and today's `onboarded_date`. The old entitlement is set to `EXPIRED` and linked via `entitlements.renewal_of`.

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
| `clm_id` | VARCHAR(100) | nullable | Contract Lifecycle Management reference ID |
| `clm_url` | VARCHAR(500) | nullable | **NEW (003)** Direct URL to the contract in the CLM system |
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
One entitlement record per software line item per contract. Primary operational record for license counts, costs, and utilisation.

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
| `annual_cost_inr` | BIGINT | nullable | Total annual cost — auto-calculated as `entitled × unit_cost` when blank on upload |
| `vendor_id` | UUID | nullable | **NEW (003)** FK → `vendors.id` — propagated from linked contract on creation |
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
| `last_seen` | DATE | nullable | Last date software was detected on the device |
| `site` | VARCHAR(100) | nullable | Physical or network site |
| `region_id` | UUID | nullable | FK → `regions.id` |
| `upload_date` | DATE | nullable | Date the record was ingested |
| `upload_batch_id` | UUID | nullable | Groups records from the same upload |
| `is_current` | BOOLEAN | NOT NULL | **NEW (003)** `true` = active record · `false` = superseded by a newer batch |
| `superseded_at` | TIMESTAMP | nullable | **NEW (003)** When this record was replaced — enables point-in-time queries |

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
| `role_label` | VARCHAR(100) | Display label: "CIO", "COE Head", "Procurement" — use `d.role_label` in code |
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
| 12 | Annual Cost (INR) | ✏️ Editable | Integer | — | Auto-calculated as `Entitled × Unit Cost` if left blank |
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
| 11 | Site | ✏️ Editable | Text | — | **NEW (003)** Physical or network site e.g. "Hyderabad HQ" |
| 12 | Region | ✏️ Editable | Text | — | e.g. "India", "Global" |

**Upload supported from:** Entitlements page **or** License Discovery page.

---

### Template 2 — `DRL_BulkOnboarding_Template.xlsx`
Used to create multiple software + contract + entitlement records in one pass.
**Download from:** Onboard Software → Bulk Upload → Download Template

#### Single Sheet — Bulk Onboarding

| # | Column | Required | Format | Notes |
|---|---|---|---|---|
| 1 | Software Name * | **YES** | Text | Canonical name. Matches existing → maps to it. New name → creates new SW_ID |
| 2 | SW_ID (leave blank=new) | No | `SW-001` | Provide to explicitly map to an existing SW entry |
| 3 | Publisher | No | Text | Vendor / publisher name |
| 4 | Category | No | Text | Must match a master category name (case-insensitive) |
| 5 | Sub-Category | No | Text | **NEW (003)** Must match a sub-category under the selected Category |
| 6 | Region | No | Text | **NEW (003)** Must match a master region name (case-insensitive) |
| 7 | Deployment | No | `cloud` / `on_premise` / `desktop_cloud` / `hybrid` | Default: `cloud` |
| 8 | GxP Relevant (yes/no) | No | `yes` / `no` | Default: `no` |
| 9 | Vendor Risk (LOW/MEDIUM/HIGH) | No | `LOW` / `MEDIUM` / `HIGH` | Default: `LOW` |
| 10 | Notes | No | Text | Business description |
| 11 | Contract Name * | **YES** | Text | Line item name as in contract |
| 12 | PO Number | No | Text | Purchase Order number |
| 13 | CLM ID | No | Text | Contract Lifecycle Management ID |
| 14 | Start Date (YYYY-MM-DD) | No | `YYYY-MM-DD` | ISO date format |
| 15 | End Date (YYYY-MM-DD) | No | `YYYY-MM-DD` | ISO date format — drives renewal alerts |
| 16 | Total Value (INR) | No | Integer | Total contract value |
| 17 | Auto-Renewal (yes/no/opt_in) | No | `yes` / `no` / `opt_in` | — |
| 18 | License Type (subscription/perpetual) | No | `subscription` / `perpetual` | Default: `subscription` |
| 19 | Metric | No | Text | Must match a master metric name (case-insensitive) |
| 20 | Entitled Count | No | Integer | Total licensed seats/units |
| 21 | Unit Cost (INR) | No | Integer | Cost per seat |
| 22 | Annual Cost (INR) | No | Integer | Auto-calculated as `Entitled × Unit Cost` if left blank |

---

## Gaps & Recommendations

### ✅ Resolved in Migration 003 (2026-05-19)

| # | Gap | Resolution |
|---|---|---|
| 1 | `canonical_name` UNIQUE constraint blocks contract renewal | **Fixed** — UNIQUE constraint dropped. `(canonical_name, onboarded_date)` used as soft identifier |
| 3 | No `vendor_id` on `entitlements` | **Fixed** — column added; propagated from linked contract on creation via multi-publish and renewal endpoints |
| 4 | `discovery_records` has no `is_current` flag | **Fixed** — `is_current BOOLEAN` + `superseded_at TIMESTAMP` added |
| 5 | `annual_cost_inr` not auto-calculated | **Fixed** — `parse_tab_a` now computes `entitled × unit_cost` when annual_cost cell is blank |
| 6 | Bulk template missing `Sub-Category` | **Fixed** — column 5 added; resolved by name from sub_categories master |
| 7 | Bulk template missing `Region` | **Fixed** — column 6 added; resolved by name from regions master |
| 8 | `contracts` missing `clm_url` | **Fixed** — `clm_url VARCHAR(500)` column added |
| 9 | No `secondary_owner_id` on `software_catalog` | **Fixed** — column added to model, onboarding schema, and multi-publish endpoint |
| 12 | Tab B missing `Site` column | **Fixed** — `Site` added at col 11; `Region` shifted to col 12 |

---

### 🟡 Open Recommendations

| # | Gap | Impact | Recommendation |
|---|---|---|---|
| 2 | `doa_hierarchy` field naming — code uses `role_label` but original design referenced `escalation_level` | Minor inconsistency in code readability | Rename column to `escalation_label` in a future migration for clarity |
| 9a | `usage_uploads.ent_id` is nullable and links to only one entitlement | Upload traceability is not per-entitlement | Add `usage_upload_entitlements` junction table linking one upload to many ENT_IDs |
| 11 | No immutable history of `entitled_count` changes between reconciliation runs | Cannot reconstruct exact utilisation at arbitrary point-in-time | Reconciliation results snapshot values at run time — sufficient for current reporting; full change history would require an `entitlement_history` event table |

---

### 🟢 Confirmed Handled

- ✅ Append-only audit trail with `before_values_json` / `after_values_json` (GxP 21 CFR Part 11)
- ✅ Contract renewal chain via `entitlements.renewal_of` self-referential FK
- ✅ File deduplication via `file_hash` SHA-256 in `usage_uploads`
- ✅ Soft-delete on users (`is_active`) preserving FK integrity
- ✅ Storage backend abstraction (`local` / `supabase` / `s3`) on both `contracts` and `usage_uploads`
- ✅ Per-user read tracking on alerts (separate `alert_reads` table, not a flag on `alerts`)
- ✅ `secondary_owner_id` on `software_catalog` (migration 003)
- ✅ `vendor_id` on `entitlements` (migration 003)
- ✅ Sub-Category + Region in bulk onboarding template (migration 003)
- ✅ Site column in Tab B License Discovery template (migration 003)
- ✅ Annual cost auto-calculation in upload processor (migration 003)
