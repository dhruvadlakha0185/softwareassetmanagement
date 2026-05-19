# Feature List & Detailed Functionality
## DRL SAM Platform v3.0

---

## Module 1 — Dashboard

**Purpose:** Single-screen executive view of the entire license portfolio.

### Features
| Feature | Detail |
|---|---|
| **KPI cards** | Total SW Titles · Total Entitlements · Total Annual Cost (₹) · Potential Savings (₹) · Risk Exposure (₹) |
| **Contract expiry timeline** | Next 5 contracts expiring, sorted by days remaining. Shows: SW name, contract name, expiry date, days remaining, total value, GxP flag, auto-renewal clause |
| **Top utilisation chart** | Top 6 entitlements by util %, rendered as colour-coded progress bars (red >100%, amber >90%, green otherwise) |
| **Spend by category** | Horizontal bar chart showing top 6 categories by annual cost. Uncategorised SW excluded to prevent distortion |
| **GxP status panel** | GxP vs. Non-GxP count with percentage progress bars. Framework detail (21 CFR / Annex 11) stored in DB but not displayed |
| **Unread alerts badge** | Count of alerts not yet read by the current user |
| **Live data** | All metrics fetched fresh on every page load — no caching |

### Calculations
- **Potential Savings** = Σ (unit_cost × idle_seats) for UNDER_UTILISED entitlements
- **Risk Exposure** = Σ (unit_cost × overage_seats) for OVER_DEPLOYED entitlements
- **Expiring 30d / 90d counts** = count of entitlements whose linked contract ends within window

---

## Module 2 — Software Catalog

**Purpose:** Canonical master list of all software titles onboarded to the platform.

### Features
| Feature | Detail |
|---|---|
| **15-column table** | SW_ID · Software Name · Publisher · Category · Sub-Category · GxP · Vendor Risk · License Model · Metric · Deploy · Region · App Owner · Onboarded Date · Notes · Action |
| **Filter bar** | Search (SW_ID / name / publisher) · All Categories · All (GxP) · All App Owners — all on one line, no wrapping |
| **Detail drawer** | 420px slide-in panel showing: status badges, publisher, metric, unit/annual cost, PO number, CLM ID, start/expiry dates, vendor/reseller, discovery source, source mgmt, app owner avatar |
| **Alias management** | Add / remove aliases per software from within the detail drawer |
| **GxP display** | Internal ENUM (no/yes_21cfr/yes_annex11/yes_both) displayed uniformly as "GxP" or "Non-GxP" |
| **Viewport layout** | No page scroll; table scrolls in its own container with sticky headers |

### Filters
- **Category** — server-side filter (fetched from `/masters/categories`)
- **GxP** — server-side (yes = any non-"no" value; no = exactly "no")
- **App Owner** — client-side on loaded rows
- **Search** — server-side OR across sw_id, canonical_name, publisher

---

## Module 3 — Entitlement Register

**Purpose:** Primary operational record for license counts, costs, and utilisation per entitlement.

### Features
| Feature | Detail |
|---|---|
| **10-column table** | ENT_ID · SW_ID · Contract Software Name · Software Name · Entitled · In-Use · Util % · Annual Cost · Last Updated · Status |
| **Status badges** | Colour-coded: OK/Active=green, Watch=amber, Over-Deployed=red, Under-Utilised=teal, Expired=grey |
| **Detail drawer** | License details (publisher, metric, unit/annual cost) · Contract (PO, CLM, dates, vendor/reseller) · Discovery & source · App owner · Update In-Use Count form |
| **Template banner** | DRL_LicenseUsage_Template_v3.xlsx guidance with Download button (headers-only blank template) |
| **Template download** | Headers-only XLSX; no pre-populated data rows — user fills from scratch |
| **Template upload** | Accepts .xlsx and .xls; Tab A updates entitlement metadata; Tab B creates discovery records |
| **Renew Contract** | ↻ Renew button in drawer (hidden for EXPIRED); opens modal with contract details + document upload |
| **Search** | Client-side across ENT_ID, SW_ID, software name (canonical), contract name |
| **Status filter** | Server-side; Type filter (subscription/perpetual) server-side |

### Upload Tab A — Editable Fields
Contract Name · License Type · Entitled Count · In-Use Count · Unit Cost · Annual Cost (auto-calc if blank) · Notes

### Upload Tab B — Creates Discovery Records
Application Tagged · Data Source · Device Type · Device ID · OS · Version · Last Seen · Site · Region

### Renewal Flow
1. Click ↻ Renew in detail drawer
2. Fill: Contract Name, PO Number, CLM ID, dates, entitled count, unit cost, annual cost
3. Optionally upload new contract document
4. On confirm: new SW_ID + new ENT_ID created; old ENT → EXPIRED; renewal_of chain maintained

---

## Module 4 — License Discovery

**Purpose:** Device-level software usage data ingested from discovery tools.

### Features
| Feature | Detail |
|---|---|
| **12-column table** | DISC_ID · Contract Software Name · SW_ID · Software Name · Application Tagged · Data Source · Type · Device ID · OS · Version · Last Updated · Region |
| **SW_ID display** | Plain SW_ID code (no matched/unmatched badges) |
| **Upload guidance banner** | Points users to Tab B of the Entitlement Template as the primary upload path |
| **Direct upload** | CSV or XLSX drag-and-drop upload; auto-matches to SW catalog by contract name / alias |
| **Source resolution** | `source_name` resolved from `discovery_sources` master in bulk (no N+1) |
| **Region resolution** | `region_name` resolved from `regions` master in bulk |
| **is_current flag** | Each record carries `is_current=true`; superseded records (from later batch for same device) carry `is_current=false` and `superseded_at` timestamp |
| **Search** | Client-side across disc_id, sw_id, contract_name, canonical_name, device_id |

---

## Module 5 — Onboarding

**Purpose:** Structured process to add new software and contracts to the platform.

### Method Selection Screen
Two modes presented as choice cards:
1. **Manual Onboarding** — 6-step guided wizard
2. **Bulk Upload** — XLSX master template

### Manual Onboarding — 6 Steps

#### Step 1–2: Contract Header (AI-Extracted)
- Upload PDF/DOCX contract → Extract with AI → or Skip
- AI-extracted fields auto-populated; amber ⚠ flags on fields needing verification
- Fields: Vendor/Publisher · Reseller · PO Number · CLM ID · Start Date · End Date · Auto-Renewal · Total Contract Value
- Upload status shows filename, size, S3 archive note

#### Step 3: Contract Line Items
- Each line item = one SW_ID + ENT_ID + Catalog entry
- "How this works" info box with Microsoft EA example
- AI-detected notice when items were auto-populated
- Per line item:
  - Contract Software Name | Canonical Name (datalist autocomplete) | SW_ID (auto/read-only)
  - License Type | License Metric | ENT_ID (auto-generated preview)
  - Entitled Seats ⚠ (amber if AI-extracted) | Unit Cost | Annual Cost (auto-calc)
  - **Deployment | Region | GxP** (per-item — formerly Step 4)
  - Notes / Business Description (per-item)
  - If new SW: Category + Sub-Category + Vendor Risk required
  - Aliases: chip-style with ✕ per alias

#### Summary Bar (live)
`Line items: N · SW_IDs: N update + N new · ENT_IDs: N · ⚠ N fields amber`

#### Step 4: Owner & DOA Escalation
- Primary App Owner (dropdown from master)
- Secondary Owner (dropdown from master)
- DOA Escalation contacts from `doa_hierarchy` master (pill display with role_label + full_name)
- + Add DOA button

#### Step 5: Source & Usage Config
- Discovery Source (dropdown from master)
- Usage Update Method (dropdown from master)

#### Step 6: Review & Publish
- Summary table: Contract Name · Canonical Name · SW_ID · ENT_ID · Metric · Seats · Annual Cost · Catalog Action
- Catalog Action badges: "Update existing" (green) or "⚠ New catalog entry" (amber)
- Amber warning listing incomplete fields by line item number
- **Publish All** → publishes all line items
- **Publish Ready Items (N)** → publishes only items with all required fields
- **💾 Save Draft** → persists wizard state to `onboarding_drafts`

### Bulk Upload
- Download `DRL_BulkOnboarding_Template.xlsx` (22 columns, example row)
- Fill in: Software Name*, SW_ID, Publisher, Category, Sub-Category, Region, Deployment, GxP, Vendor Risk, Notes, Contract Name*, PO, CLM, Dates, Value, Auto-Renewal, License Type, Metric, Entitled, Unit Cost, Annual Cost
- Upload → system creates SW entries, Contracts, Entitlements in one pass
- Summary shows: SW_IDs created · ENT_IDs created · rows skipped (with reasons)

---

## Module 6 — Reconciliation

**Purpose:** Compare entitled vs. actual usage; generate AI recommendations.

### Features
| Feature | Detail |
|---|---|
| **13-column table** | ENT ID · SW ID · Software Name · Publisher · Category · Metric · Region · Entitled (centre) · In-Use (centre) · Delta (centre, coloured) · Util % (bar + number) · Status · AI Recommendation |
| **Status badges** | Same colour scheme as Entitlements (green/amber/red/teal) |
| **Delta column** | Teal `+N` = idle capacity; Red `−N` = over-deployed |
| **Sort order** | OVER_DEPLOYED → UNDER_UTILISED → WATCH → OK (by priority) |
| **AI Recommendation** | OVER_DEPLOYED/UNDER_UTILISED: highlighted coloured box (full text, no truncation) · OK/WATCH: "No action required at this stage" in grey italic |
| **Run button** | COE Admin triggers manual run; shows last run date + count processed |
| **Last run display** | Single most recent run record (not a full history list) |
| **Auto-run** | Daily 00:00 UTC via APScheduler — no UI interaction required |

---

## Module 7 — Cost Optimisation Scorecard

**Purpose:** CIO/CFO view of right-sizing opportunities and audit risk exposure.

### Features
| Feature | Detail |
|---|---|
| **Hero cards** | Total Identifiable Savings (navy) · Savings Realised YTD (Phase 2) · Harvest Pending (Phase 2) |
| **Stat row** | Under-Utilised count · Renewal Actions (expiring ≤90d) · Risk Exposure (red) |
| **Priority table** | 14 columns: Priority (P1/P2…) · SW_ID · Software · Publisher · Type · Metric · Entitled · In-Use · Idle · Util% · Unit Cost · Est. Annual Saving · Next Renewal · Opportunity tag |
| **Opportunity tags** | Audit Risk (red) · GxP Expiring (red) · Renewal Due (amber) · Right-Size (green) · Monitor (blue) |
| **Savings display** | UNDER_UTILISED: green `₹XL` savings · OVER_DEPLOYED: red `₹XL exposure` |
| **AI insight bar** | Bottom sticky bar listing top 3 opportunities with amounts |
| **Viewport layout** | No page scroll; horizontal scroll only in table section |

### Calculations
- **Est. Annual Saving (UNDER_UTILISED)** = unit_cost × (entitled − in_use)
- **Est. Exposure (OVER_DEPLOYED)** = unit_cost × (in_use − entitled)
- **Total Identifiable Savings** = Σ savings for UNDER_UTILISED only
- **Risk Exposure** = Σ exposure for OVER_DEPLOYED only

---

## Module 8 — Audit Trail

**Purpose:** GxP 21 CFR Part 11 compliant append-only change log.

### Features
| Feature | Detail |
|---|---|
| **Table columns** | Timestamp (UTC) · Action · Entity · Entity ID · SW_ID · GxP · Reason · Details |
| **Action types** | CATALOG_CREATED · CATALOG_UPDATED · ENTITLEMENT_UPDATED · SOFTWARE_ONBOARDED · RECONCILIATION_RUN · ENTITLEMENT_RENEWED |
| **Detail expand** | Click row to expand before/after JSON values |
| **Filter bar** | SW_ID filter · All Entities · All Actions — single line |
| **XLSX export** | Full filtered export with all columns |
| **GxP badge** | Rows for GxP software shown with teal GxP chip |
| **Immutability** | Append-only — no edit or delete in UI or API |

---

## Module 9 — Alerts & Notifications

**Purpose:** Proactive alerts for contract renewals and utilisation anomalies.

### Features
| Feature | Detail |
|---|---|
| **Alert types** | RENEWAL (contract expiry approaching) · UTILISATION (over-deployed / under-utilised) |
| **Severity levels** | CRITICAL (<7d) · HIGH (<14d) · MEDIUM (<30d) · INFO (<90d) |
| **Card display** | Colour-coded by severity; shows title, type, GxP flag, structured body (ENT, SW name, dates, util%) |
| **Read tracking** | Per-user; Mark read · Mark all as read |
| **Filter bar** | All Types · All Severities · Unread only — single line |
| **Sidebar badge** | Unread count shown in sidebar navigation |
| **Auto-generation** | Daily midnight UTC via APScheduler |
| **DOA escalation** | GxP software alerts routed per `doa_hierarchy` tier definitions |

---

## Module 10 — App Owners

**Purpose:** Manage the register of application owners and DOA escalation hierarchy.

### Features
| Feature | Detail |
|---|---|
| **Owner register** | Full name · Email · Business unit · Role · Region · Active status |
| **DOA hierarchy** | Tier 1 (CIO/Head) and Tier 2 (Manager); role label; alert scope; category coverage |
| **Add / deactivate** | COE Admin can add new owners; deactivate without deleting (preserves FK integrity) |

---

## Module 11 — Masters & Config

**Purpose:** Manage all reference data used across the platform.

### Sub-modules
| Master | Key Fields | Used In |
|---|---|---|
| **Categories** | Name, GxP applicable, sub-categories | Catalog, entitlements, bulk upload, cost scorecard chart |
| **Sub-Categories** | Name, parent category | Catalog, onboarding |
| **Vendors** | Name, audit risk | Catalog, contracts, entitlements |
| **License Metrics** | Name, description, how-to-count | Entitlements, templates, reconciliation |
| **Discovery Sources** | Name, type, coverage, frequency, status | Discovery, entitlements |
| **Usage Update Methods** | Name, template_required | Entitlements, onboarding |
| **Regions** | Name, regulatory zone, data residency, AWS region | All modules |
