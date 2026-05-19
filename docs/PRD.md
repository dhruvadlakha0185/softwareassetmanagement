# Product Requirements Document
## DRL SAM Platform v3.0 — Software Asset Management
**Dr. Reddy's Laboratories · IT COE**
**Version:** 3.0 | **Status:** Implemented | **Date:** May 2026

---

## 1. Executive Summary

The DRL SAM Platform is a GxP-compliant Software Asset Management system built specifically for Dr. Reddy's Laboratories. It provides a single source of truth for all software licenses, contracts, usage, and costs across DRL's global operations. The platform enables IT COE to manage license entitlements, reconcile actual usage against purchased seats, identify optimisation opportunities, and maintain an audit trail that meets 21 CFR Part 11 and EU Annex 11 requirements.

---

## 2. Problem Statement

### Current Pain Points
| Problem | Business Impact |
|---|---|
| License data scattered across spreadsheets, emails, and CLM tools | No real-time view of spend or compliance posture |
| No automated comparison of entitled vs. actual usage | Over-spending on unused licenses; audit risk on over-deployed software |
| Manual contract expiry tracking | Renewals missed; auto-renewals triggered without review |
| GxP software changes not formally tracked | Non-compliance with 21 CFR Part 11 / EU Annex 11 |
| No visibility into shadow IT (unregistered software usage) | Security and compliance exposure |
| App owners unable to self-report usage updates | IT COE bottleneck; delayed data quality |

### Root Cause
No single integrated system connects the contract lifecycle (procurement), software catalog (IT), actual device usage (discovery tools), and compliance audit trail into one coherent platform.

---

## 3. Goals & Success Metrics

### Primary Goals
1. **100% visibility** — every software license, contract, and entitlement in one catalog
2. **Automated reconciliation** — daily comparison of entitled vs. in-use with AI recommendations
3. **Cost optimisation** — identify and quantify right-size opportunities across the portfolio
4. **GxP compliance** — 21 CFR Part 11 compliant audit trail for all catalog changes
5. **Self-service** — App Owners can upload usage data without IT COE involvement

### Success Metrics
| Metric | Target |
|---|---|
| License catalog completeness | 100% of active licenses onboarded within 90 days |
| Reconciliation frequency | Daily automated runs |
| Cost savings identified | ≥ ₹1 Cr identified in first reconciliation cycle |
| Audit trail coverage | 100% of catalog changes logged |
| Renewal miss rate | 0 missed renewals post-go-live |
| Template upload adoption | ≥ 80% of App Owners uploading via template monthly |

---

## 4. User Personas

### COE Admin
- **Who:** IT COE team member (2–3 people)
- **Responsibilities:** Onboard software, manage catalog, run reconciliation, export audit trail, manage masters (categories, vendors, metrics)
- **Access level:** Full read/write across all modules

### App Owner
- **Who:** Department IT lead or business system owner (15–20 people across functions)
- **Responsibilities:** Upload monthly usage data for their software portfolio, review alerts, update in-use counts
- **Access level:** Read-only catalog; upload usage template; view own software's alerts

### CIO / CFO (Read-Only)
- **Who:** Senior leadership
- **Responsibilities:** Review dashboard KPIs, cost optimisation scorecard, GxP compliance posture
- **Access level:** Read-only across all modules

---

## 5. Functional Requirements

### FR-01 — Software Catalog
- System shall maintain a canonical master list of all software titles with a unique `SW_ID`
- Each software entry shall carry: publisher, category, sub-category, deployment type, region, GxP flag, vendor risk, app owner, and notes
- GxP flag shall support: Non-GxP / GxP (21 CFR Part 11) / GxP (Annex 11) / GxP (Both)
- Displayed to users as GxP / Non-GxP only; framework detail preserved in DB
- Software aliases shall be maintained to map discovery tool names to canonical entries
- COE Admin shall be able to search by SW_ID, name, publisher; filter by category, GxP, app owner

### FR-02 — Contract & Entitlement Management
- Each contract shall be linked to one primary software entry
- Each entitlement (line item) shall carry: entitled count, in-use count, unit cost, annual cost, license type, metric, region, discovery source, usage update method, app owner
- Multiple line items per contract shall each generate their own SW_ID + ENT_ID
- Contract documents (PDF/DOCX) shall be uploaded and archived to S3/Supabase storage
- Entitlement status shall be maintained: ACTIVE / EXPIRED / WATCH / OVER_DEPLOYED / UNDER_UTILISED / OK

### FR-03 — Contract Onboarding (Manual)
- 6-step wizard: Contract Header → AI Extraction → Line Items → Owner & DOA → Source Config → Review & Publish
- AI shall extract: vendor, PO number, CLM ID, dates, total value, auto-renewal clause, line items, license type, metric, seat counts, unit costs
- Fields extracted by AI shall be visually flagged (amber) for human verification before publish
- Each line item shall independently specify deployment, region, GxP, notes, aliases
- Canonical name resolution: type to search existing catalog; unmatched names create new SW entry

### FR-04 — Bulk Onboarding
- XLSX template download with 22 columns covering all SW and contract fields
- Template processing shall create SW entries, contracts, and entitlements in one pass
- Sub-Category and Region shall be resolved by name against masters tables
- Rows with missing required fields shall be reported as skipped with reason

### FR-05 — License Discovery
- Device-level usage records shall be ingested via CSV or XLSX upload
- Records shall be auto-matched to SW catalog by contract name (exact + alias lookup)
- Each record shall carry: device ID, device type, OS, version, last seen date, site, region
- `is_current` flag shall track which records are active vs. superseded
- Discovery data shall also be uploadable via Tab B of the Entitlement Template

### FR-06 — Usage Update (Template Upload)
- COE Admin and App Owners shall download a pre-formatted XLSX template
- Tab A shall allow updating: contract name, license type, entitled count, in-use count, unit cost, annual cost, notes
- Tab B shall allow submitting discovery records
- Upload shall match rows by ENT_ID (primary) or SW_ID (fallback with disambiguation)
- Annual cost shall be auto-calculated as `entitled × unit_cost` if left blank
- Previous upload files shall be archived to S3 before the new upload is processed

### FR-07 — Reconciliation
- System shall compare entitled_count vs. in_use_count for every entitlement
- Statuses shall be assigned: OVER_DEPLOYED (>100%), WATCH (>90%), OK (50–90%), UNDER_UTILISED (<30%)
- GPT-4o shall generate 1–2 sentence actionable recommendations per entitlement
- Results shall be sorted by priority: OVER_DEPLOYED → UNDER_UTILISED → WATCH → OK
- Reconciliation shall run automatically every day at midnight UTC via APScheduler
- COE Admin shall be able to trigger manual runs from the UI

### FR-08 — Cost Optimisation Scorecard
- System shall calculate and display:
  - Total Identifiable Savings = Σ (unit_cost × idle_seats) for UNDER_UTILISED entitlements
  - Risk Exposure = Σ (unit_cost × overage_seats) for OVER_DEPLOYED entitlements
- All opportunities shall be ranked by estimated annual saving (descending)
- OVER_DEPLOYED items shall be flagged in red with "exposure" label
- UNDER_UTILISED items shall be shown in green as right-size opportunities

### FR-09 — Contract Renewal
- COE Admin shall initiate renewal from the Entitlement detail drawer
- Renewal shall create: new SW_ID, new Contract record, new ENT_ID (with `renewal_of` FK)
- Old entitlement shall be set to EXPIRED and preserved in the register
- Renewal modal shall accept a new contract document (PDF/DOCX) for upload
- Renewal chain shall be queryable via `entitlements.renewal_of`

### FR-10 — Alerts & Notifications
- System shall generate alerts for:
  - RENEWAL: contracts expiring within 90 days (CRITICAL < 7d, HIGH < 14d, MEDIUM < 30d, INFO < 90d)
  - UTILISATION: OVER_DEPLOYED and UNDER_UTILISED entitlements
- Alerts shall display severity, type, GxP flag, and structured body (ENT ID, SW name, dates, util %)
- Each user shall have independent read-state (mark as read / mark all as read)
- DOA hierarchy shall define escalation routing for GxP software alerts

### FR-11 — Audit Trail
- All catalog create/update, entitlement update, onboarding, reconciliation, and renewal actions shall be logged
- Each log entry shall capture: user, action type, entity, before/after values (JSONB), GxP flag, UTC timestamp
- Audit trail shall be append-only; no UPDATE or DELETE permitted (21 CFR Part 11)
- COE Admin shall be able to filter by entity type, action type, SW_ID, and date range
- Full audit trail shall be exportable to XLSX

### FR-12 — Dashboard
- Executive KPI cards: total SW titles, total entitlements, total annual cost, potential savings, risk exposure
- Contract expiry timeline: next 5 expiring contracts with days remaining
- Top utilisation: 6 highest-utilised entitlements with progress bars
- Spend by category: bar chart of top 6 categories by annual cost (excluding uncategorised)
- GxP Software Status: GxP vs. Non-GxP count with progress bars

---

## 6. Non-Functional Requirements

| Requirement | Target |
|---|---|
| **Response time** | API responses < 500ms for list endpoints; AI extraction < 30s |
| **Availability** | 99.5% uptime during business hours |
| **Security** | JWT auth (dev) / SAML SSO (production); role-based access control |
| **GxP compliance** | Append-only audit trail; file hash (SHA-256) for tamper evidence |
| **Data residency** | All data within India region (AWS ap-south-1) |
| **File storage** | Contracts and uploads archived to AWS S3 with lifecycle policies |
| **Scalability** | Designed for 500+ software titles, 1000+ entitlements |
| **Browser support** | Chrome 110+, Edge 110+, Safari 16+ |

---

## 7. Constraints & Assumptions

- AI contract extraction requires OpenAI GPT-4o API key; falls back to manual entry if unavailable
- Reconciliation advisor falls back to rule-based recommendations when OpenAI is unavailable
- Discovery data does not replace formal usage reporting; it supplements it
- Contract renewal creates a new catalog entry (not a version update) to preserve GxP validation records
- Phase 1 excludes: Shadow IT triage workflow, License Harvest module, SAML SSO (planned Phase 2)
