# AI-Generated Procurement Notes — Design Spec

**Date:** 2026-05-27
**Status:** Awaiting implementation

---

## Problem Statement

The `notes` field on each software entitlement is left blank when users publish onboarding without manually writing descriptions. CIO and procurement reviewers need a concise procurement rationale for every entitlement — why this software was procured, what business need it solves — without burdening the onboarding user with writing it.

---

## Scope

- Trigger an OpenAI `gpt-4o` call for each line item with a blank `notes` field at publish time (synchronous, Option A)
- The LLM draws on its training knowledge about the software plus structured payload fields to write a 3–5 sentence procurement rationale in flowing prose
- Frontend shows a loading banner and updated button label during the (slightly longer) publish request
- No schema changes, no migrations, no new API endpoints

---

## 1. Data Flow

### Trigger point

Inside `multi_publish` (before any DB writes), the route:

1. Batch-resolves lookup names: category names, sub-category names, metric names, license type names — single DB queries using the IDs present in the payload
2. For each line item where `item.notes` is `None` or `""`, assembles a `context` dict and calls `generate_entitlement_notes(context)`
3. Writes the returned string back to `item.notes` before creating the `Entitlement` and `SoftwareCatalog` records

If a line item already has notes, the function is never called for it — zero latency added.

### Error handling

| Failure | Behaviour |
|---|---|
| OpenAI timeout (>10 s) | Skip notes for that item; `notes` written as `None`; publish succeeds |
| OpenAI API error (rate limit, 5xx, bad key) | Same as timeout — graceful skip, error logged |
| All items have notes already | `generate_entitlement_notes` never called; no latency added |

Publish is never blocked by a notes generation failure. No user-facing error message — the notes field appears blank and is editable post-publish.

---

## 2. LLM Context

`generate_entitlement_notes` receives a single `context: dict` with the following fields:

### Software identity
| Key | Source | Example |
|---|---|---|
| `primary_sw_name` | `item.primary_sw_name` | "Microsoft 365 E3" |
| `publisher` | `item.publisher` | "Microsoft Corporation" |
| `contract_name` | `item.contract_name` | "Microsoft 365 E3 — Enterprise Agreement" |
| `category_name` | resolved from `item.category_id` | "Productivity" |
| `sub_category_name` | resolved from `item.sub_category_id` | "Collaboration" |

### Procurement scope
| Key | Source | Example |
|---|---|---|
| `business_units` | `item.business_units` | `["Finance", "R&D"]` |
| `regions` | `item.regions` | `["India", "US"]` |
| `entitled_count` | `item.entitled_count` | `500` |
| `metric_name` | resolved from `item.metric_id` | "Named Users" |

### Contract terms
| Key | Source | Example |
|---|---|---|
| `vendor_name` | `payload.vendor_name` | "Microsoft Ireland Operations Ltd." |
| `start_date` | `payload.start_date` | "2026-04-01" |
| `end_date` | `payload.end_date` | "2027-03-31" |
| `annual_cost` | `item.annual_cost` formatted | "₹1,20,00,000" |
| `currency` | `payload.currency` | "INR" |
| `auto_renewal_clause` | `payload.auto_renewal_clause` | "yes" |

### Classification flags
| Key | Source | Example |
|---|---|---|
| `deployment` | `item.deployment` | "cloud" |
| `gxp_flag` | `item.gxp_flag` | "no" |
| `license_type_name` | resolved from `item.license_type_id` | "Subscription" |

---

## 3. LLM Prompt Design

### System prompt

```
You are a Software Asset Management analyst at Dr. Reddy's Laboratories (DRL), a global pharmaceutical company.

Your task is to write a procurement rationale note for a software entitlement record. This note will be read by the CIO and procurement reviewers.

Write exactly 3–5 sentences of flowing prose. No bullet points, no headers, no markdown.

Draw on your training knowledge about what this software does and its typical enterprise use cases. Anchor all claims about scope, cost, and organisational coverage to the fields provided — do not invent figures or organisational details not present in the input.

Tone: professional, concise, factual.
```

### User message (assembled from context dict)

```
Software: {primary_sw_name}
Publisher: {publisher}
Contract name: {contract_name}
Category: {category_name} > {sub_category_name}
License type: {license_type_name}
Deployment: {deployment}
GxP regulated: {gxp_flag}
Entitled: {entitled_count} {metric_name}
Business units: {business_units joined by ", "}
Regions: {regions joined by ", "}
Vendor: {vendor_name}
Contract period: {start_date} to {end_date}
Annual cost: {annual_cost} {currency}
Auto-renewal: {auto_renewal_clause}

Write the procurement rationale note.
```

### Model & parameters

| Parameter | Value |
|---|---|
| Model | `gpt-4o` |
| `max_tokens` | `250` |
| `temperature` | `0.4` |
| `timeout` | `10` seconds |

Low temperature keeps the output factual and consistent. `max_tokens: 250` is sufficient for 5 sentences and prevents runaway output.

---

## 4. Frontend Changes

### Publish button

While `publishing` is `true`, button label changes from `"Publishing…"` to `"Publishing updates in progress…"`. Button remains disabled.

### Status banner

An amber info banner renders above the "Step 6 — Review & Publish" card when `publishing` is `true`:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⏳  Publishing updates in progress — generating notes with AI… │
└─────────────────────────────────────────────────────────────────┘
```

- Background: `var(--amber-l)`
- Text: `var(--amber-m)`
- Padding: `10px 16px`, `borderRadius: 8`
- Disappears when publish response arrives (success or error)

---

## 5. Files to Change

| File | Change |
|---|---|
| `backend/app/services/ai/notes_generator.py` | **New file.** `generate_entitlement_notes(context: dict) -> str \| None` — assembles prompt, calls `gpt-4o`, returns generated string or `None` on failure |
| `backend/app/api/v1/routes/onboarding.py` | Batch-resolve lookup names at route start; call `generate_entitlement_notes` for each blank-notes item before DB write |
| `frontend/src/pages/Onboarding/OnboardingPage.jsx` | Update publish button label; add amber `publishing` banner above Review & Publish section |

---

## Out of Scope

- Regenerating notes post-publish (separate edit flow)
- User editing the generated note before publish (they can edit it after)
- Displaying the generated note on the publish success screen (it's in the DB; viewable via entitlement detail)
- Any UI for the prompt or model parameters
- Streaming the response (short paragraph; streaming adds complexity for no UX gain)
