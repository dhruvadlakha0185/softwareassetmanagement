# CIO Briefing — DRL SAM Platform v3.0
## Slide Content Pack · May 2026

---

# SLIDE 1 — Platform Capabilities & What We've Built

## Title
**DRL SAM Platform v3.0 — One Platform for All Software Licenses**
*From chaos to compliance: unified visibility, AI-powered insights, GxP-grade audit trail*

---

## Left Column: What the Platform Does

### 🎯 Core Capabilities

**License Visibility**
- Single canonical catalog of every software title across DRL — every SW_ID, publisher, category, GxP flag, and app owner in one place
- 15-column table with instant search and filtering by category, GxP status, and owner

**Contract & Entitlement Management**
- Every contract, PO number, CLM ID, and line item tracked with start/expiry dates
- Renewal alerts triggered automatically — no more missed renewals
- Full contract renewal workflow creates a new auditable record without overwriting history

**Usage vs. Entitlement Reconciliation**
- Daily automated comparison: what we've purchased vs. what's in use
- GPT-4o generates actionable right-size recommendations per entitlement
- Visual status: Over-Deployed (red) · Watch (amber) · Under-Utilised (teal) · OK (green)

**Cost Optimisation Scorecard**
- Total Identifiable Savings = money recoverable by right-sizing under-utilised licenses
- Risk Exposure = financial liability from licenses used without entitlement
- All opportunities ranked by estimated annual saving (₹)

---

## Right Column: Key Numbers

| Metric | Value |
|---|---|
| Modules delivered | 11 |
| API endpoints | 72+ |
| Database tables | 18 |
| Daily automated jobs | Reconciliation + Alert generation |
| Template columns (bulk onboard) | 22 |
| Alembic migrations | 3 |
| GxP compliance standard | 21 CFR Part 11 + EU Annex 11 |

---

## Bottom Banner: What Makes This Different

> **GxP-grade audit trail** — every catalog change, entitlement update, and contract action is logged append-only with before/after values, user ID, and UTC timestamp. This is not a SAM tool with a log — it is a compliance-first platform with SAM built on top.

---

# SLIDE 2 — How It Works: The Process

## Title
**End-to-End License Lifecycle — Automated, Transparent, Compliant**

---

## Process Flow (Left to Right)

```
CONTRACT                  CATALOG                  OPERATIONS                INSIGHTS
────────                  ───────                  ──────────                ────────

Signed contract       →   Software onboarded   →   Monthly usage        →   Dashboard KPIs
uploaded by COE           AI extracts: vendor,      upload by App Owners      Real-time cost,
Admin (PDF/DOCX)          PO, dates, line items     via XLSX template         utilisation, GxP

OR:                       Each line item gets       Daily auto-run:          Cost Optimisation:
Bulk upload via           its own SW_ID +           Entitled vs. In-Use      Right-size savings
22-column XLSX            ENT_ID + Contract         compared → statuses      vs. Audit exposure

                          GxP flag set              GPT-4o generates         Renewal alerts
                          Deployment, Region,       recommendations           auto-triggered
                          Owner, Source Config      per entitlement          30/7 days ahead
```

---

## Three User Journeys

### Journey 1: COE Admin — Onboarding a New Contract
1. Upload signed contract PDF → AI extracts 11–13 fields
2. Review AI-filled fields (amber-flagged for verification)
3. Map each line item to canonical SW name → SW_IDs auto-assigned
4. Set app owner, discovery source, usage method
5. Publish → SW catalog + contracts + entitlements created
6. Audit trail entry created automatically

### Journey 2: App Owner — Monthly Usage Update
1. Download `DRL_LicenseUsage_Template_v3.xlsx` from Entitlements page
2. Fill in: Entitled Count, In-Use Count, Unit Cost for their software rows
3. Upload XLSX → system updates entitlement records
4. Optionally fill Tab B with device-level discovery data
5. Previous file auto-archived to S3

### Journey 3: COE Admin — Monthly Reconciliation Review
1. Reconciliation runs automatically at midnight (or trigger manually)
2. GPT-4o generates per-entitlement recommendations
3. Review results sorted by priority: Over-Deployed first
4. Act on Cost Optimisation scorecard: right-size at next renewal
5. Export audit trail for compliance review

---

## Compliance Checkpoints

| Checkpoint | How Platform Handles It |
|---|---|
| 21 CFR Part 11 audit trail | Append-only log with before/after, user, timestamp |
| GxP software change control | Every catalog/entitlement change requires authenticated session |
| Contract archival | Superseded contracts moved to S3 archive on renewal |
| DOA escalation | Tier 1/2 hierarchy defined in masters; GxP alerts routed accordingly |
| File tamper evidence | SHA-256 hash stored on every uploaded file |
| Renewal history | Full chain preserved: old ENT → new ENT via `renewal_of` FK |

---

# SLIDE 3 — What's Next: Phase 2 Roadmap

## Title
**Phase 2 — Closing the Loop: From Insight to Action**
*Building on the compliance foundation to drive automated savings*

---

## Phase 2 Feature Priorities

### Priority 1 — License Harvest Module 🟢
*Closes the loop between "we identified savings" and "we reclaimed licenses"*

| Feature | Description |
|---|---|
| Harvest workflow | COE Admin initiates harvest against identified idle entitlements |
| Harvest tracking | Records seats decommissioned, value recovered, date of action |
| Savings realised dashboard | YTD savings realised vs. identified opportunities |
| Harvest pending count | Seats approved for harvest but not yet actioned |

**Business value:** Currently we show ₹X Cr in potential savings but cannot prove we acted on it. Harvest module closes that loop.

---

### Priority 2 — Shadow IT Triage 🟡
*Identify and risk-score software detected by discovery tools that has no catalog entry*

| Feature | Description |
|---|---|
| Unmatched records panel | Discovery records with no sw_id resolution |
| Risk scoring | Auto-score based on publisher, security blacklists, usage frequency |
| Triage workflow | COE Admin: Approve (onboard to catalog) / Block / Defer |
| Auto-block integration | API hook to push blocked software to endpoint management tool |

**Business value:** Closes the shadow IT visibility gap; reduces security surface area.

---

### Priority 3 — SSO / SAML Integration 🟡
*Replace local password authentication with DRL corporate identity*

| Feature | Description |
|---|---|
| SAML 2.0 IdP integration | Connect to DRL's Azure AD / Okta |
| Role mapping | SAML attributes → COE_ADMIN / APP_OWNER / READ_ONLY |
| Session management | Replace JWT refresh with SAML session cookies |

**Business value:** Removes password management burden; enforces DRL MFA policies.

---

### Priority 4 — Advanced Analytics & Reporting 🔵
*Board-ready reporting beyond the live dashboard*

| Feature | Description |
|---|---|
| Scheduled PDF/XLSX reports | Monthly cost summary emailed to CIO/CFO |
| YoY trend analysis | Cost, utilisation, and GxP posture over time |
| Vendor spend analysis | Aggregate spend per vendor across all contracts |
| Contract risk heatmap | Visualise upcoming renewals + GxP exposure in one view |

---

### Priority 5 — Workflow Enhancements 🔵

| Feature | Description |
|---|---|
| Approval workflow | Entitlement updates above ₹X lakh require COE Head approval |
| CLM deep-link | `clm_url` field in contracts enables one-click navigation to contract document |
| Secondary owner alerts | Secondary app owner receives alerts when primary is unresponsive |
| Discovery `is_current` UI | Filter discovery records by current batch only |

---

## Phase 2 Timeline Estimate

| Phase | Scope | Estimated Effort |
|---|---|---|
| P2.1 | License Harvest Module + Shadow IT Triage | 6–8 weeks |
| P2.2 | SSO / SAML Integration | 3–4 weeks |
| P2.3 | Advanced Analytics + Reports | 4–6 weeks |
| P2.4 | Workflow Enhancements | 3–4 weeks |

---

## What Phase 1 Gave Us (Foundation)

> Phase 1 delivered the **data foundation and compliance infrastructure** that Phase 2 builds on:
> - ✅ Complete license catalog with GxP audit trail
> - ✅ Reconciliation engine with AI recommendations
> - ✅ Cost optimisation scorecard (identify savings)
> - ✅ Renewal lifecycle management
> - ✅ Template-based App Owner self-service
>
> Phase 2 converts **insights into actions** and **actions into verified savings**.

---

*Document prepared for CIO briefing — DRL IT COE · May 2026*
