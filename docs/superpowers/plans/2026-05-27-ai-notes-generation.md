# AI-Generated Procurement Notes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At publish time, auto-generate a 3–5 sentence procurement rationale note (via GPT-4o) for every software entitlement whose `notes` field is blank, and show a loading banner in the frontend while the API call is in flight.

**Architecture:** A new `notes_generator.py` service assembles a structured context dict from line-item + contract fields and calls `gpt-4o` (temperature 0.4, max_tokens 250, 10 s timeout). The `multi_publish` route batch-resolves lookup names before the item loop, calls the generator for blank-notes items, and uses the returned string when constructing both `SoftwareCatalog` and `Entitlement` DB records. Failures are swallowed — publish never blocks on a notes failure. The frontend shows an amber banner + updated button label while `publishing` is true.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy async, `openai` Python SDK (AsyncOpenAI), React 18 / Vite

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/app/services/ai/notes_generator.py` | Create | `generate_entitlement_notes(context: dict) -> str \| None` |
| `backend/app/api/v1/routes/onboarding.py` | Modify | Batch lookups + call generator per blank-notes item |
| `backend/tests/test_notes_generator.py` | Create | Unit tests for the generator (mocked OpenAI) |
| `backend/tests/test_onboarding.py` | Modify | Integration test: blank notes gets filled; existing notes not overwritten |
| `frontend/src/pages/Onboarding/OnboardingPage.jsx` | Modify | Amber banner + updated button label during `publishing` |

---

## Task 1: `notes_generator.py` — service file

**Files:**
- Create: `backend/app/services/ai/notes_generator.py`
- Test: `backend/tests/test_notes_generator.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_notes_generator.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


SAMPLE_CONTEXT = {
    "primary_sw_name": "Microsoft 365 E3",
    "publisher": "Microsoft Corporation",
    "contract_name": "Microsoft 365 E3 — Enterprise Agreement",
    "category_name": "Productivity",
    "sub_category_name": "Collaboration",
    "license_type_name": "Subscription",
    "deployment": "cloud",
    "gxp_flag": "no",
    "entitled_count": 500,
    "metric_name": "Named Users",
    "business_units": ["Finance", "R&D"],
    "regions": ["India", "US"],
    "vendor_name": "Microsoft Ireland Operations Ltd.",
    "start_date": "2026-04-01",
    "end_date": "2027-03-31",
    "annual_cost": 12000000,
    "currency": "INR",
    "auto_renewal_clause": "yes",
}


@pytest.mark.asyncio
async def test_returns_none_when_key_is_dummy():
    """No OpenAI call when key is the dev placeholder."""
    from app.services.ai.notes_generator import generate_entitlement_notes
    with patch("app.services.ai.notes_generator.settings") as mock_settings:
        mock_settings.openai_api_key = "dummy"
        result = await generate_entitlement_notes(SAMPLE_CONTEXT)
    assert result is None


@pytest.mark.asyncio
async def test_returns_generated_string_on_success():
    """Returns the LLM content string when OpenAI call succeeds."""
    from app.services.ai.notes_generator import generate_entitlement_notes

    mock_message = MagicMock()
    mock_message.content = "  Microsoft 365 E3 is an enterprise productivity suite.  "
    mock_choice = MagicMock()
    mock_choice.message = mock_message
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    with patch("app.services.ai.notes_generator.settings") as mock_settings, \
         patch("app.services.ai.notes_generator.AsyncOpenAI", return_value=mock_client):
        mock_settings.openai_api_key = "sk-test-key"
        result = await generate_entitlement_notes(SAMPLE_CONTEXT)

    assert result == "Microsoft 365 E3 is an enterprise productivity suite."


@pytest.mark.asyncio
async def test_returns_none_on_openai_exception():
    """Swallows exceptions and returns None so publish is never blocked."""
    from app.services.ai.notes_generator import generate_entitlement_notes

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(side_effect=Exception("API error"))

    with patch("app.services.ai.notes_generator.settings") as mock_settings, \
         patch("app.services.ai.notes_generator.AsyncOpenAI", return_value=mock_client):
        mock_settings.openai_api_key = "sk-test-key"
        result = await generate_entitlement_notes(SAMPLE_CONTEXT)

    assert result is None


@pytest.mark.asyncio
async def test_build_user_message_formats_cost():
    """_build_user_message formats annual_cost with commas."""
    from app.services.ai.notes_generator import _build_user_message
    msg = _build_user_message(SAMPLE_CONTEXT)
    assert "12,000,000 INR" in msg


@pytest.mark.asyncio
async def test_build_user_message_handles_missing_fields():
    """_build_user_message handles None/missing fields gracefully."""
    from app.services.ai.notes_generator import _build_user_message
    msg = _build_user_message({
        "primary_sw_name": "SAP S/4HANA",
        "contract_name": "SAP ERP License",
    })
    assert "SAP S/4HANA" in msg
    assert "not specified" in msg
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && python -m pytest tests/test_notes_generator.py -v 2>&1 | head -30
```

Expected: `ModuleNotFoundError: No module named 'app.services.ai.notes_generator'`

- [ ] **Step 3: Create `backend/app/services/ai/notes_generator.py`**

```python
"""
GPT-4o procurement notes generator.
Takes a context dict for one software entitlement, returns a 3-5 sentence
procurement rationale string, or None on failure.
Never raises — failures are swallowed so publish is never blocked.
"""
from openai import AsyncOpenAI
from app.core.config import settings

SYSTEM_PROMPT = (
    "You are a Software Asset Management analyst at Dr. Reddy's Laboratories (DRL), "
    "a global pharmaceutical company.\n\n"
    "Your task is to write a procurement rationale note for a software entitlement record. "
    "This note will be read by the CIO and procurement reviewers.\n\n"
    "Write exactly 3-5 sentences of flowing prose. No bullet points, no headers, no markdown.\n\n"
    "Draw on your training knowledge about what this software does and its typical enterprise use cases. "
    "Anchor all claims about scope, cost, and organisational coverage to the fields provided — "
    "do not invent figures or organisational details not present in the input.\n\n"
    "Tone: professional, concise, factual."
)


def _build_user_message(ctx: dict) -> str:
    annual_cost = ctx.get("annual_cost")
    currency = ctx.get("currency", "INR")
    cost_str = f"{annual_cost:,} {currency}" if annual_cost else "not specified"

    bus = ", ".join(ctx.get("business_units") or []) or "not specified"
    regions = ", ".join(ctx.get("regions") or []) or "not specified"

    return (
        f"Software: {ctx.get('primary_sw_name', '')}\n"
        f"Publisher: {ctx.get('publisher') or 'not specified'}\n"
        f"Contract name: {ctx.get('contract_name', '')}\n"
        f"Category: {ctx.get('category_name') or 'not specified'} > {ctx.get('sub_category_name') or 'not specified'}\n"
        f"License type: {ctx.get('license_type_name') or 'not specified'}\n"
        f"Deployment: {ctx.get('deployment') or 'not specified'}\n"
        f"GxP regulated: {ctx.get('gxp_flag') or 'no'}\n"
        f"Entitled: {ctx.get('entitled_count') or 'not specified'} {ctx.get('metric_name') or 'licenses'}\n"
        f"Business units: {bus}\n"
        f"Regions: {regions}\n"
        f"Vendor: {ctx.get('vendor_name') or 'not specified'}\n"
        f"Contract period: {ctx.get('start_date') or 'not specified'} to {ctx.get('end_date') or 'not specified'}\n"
        f"Annual cost: {cost_str}\n"
        f"Auto-renewal: {ctx.get('auto_renewal_clause') or 'not specified'}\n\n"
        "Write the procurement rationale note."
    )


async def generate_entitlement_notes(context: dict) -> str | None:
    if settings.openai_api_key == "dummy":
        return None
    try:
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": _build_user_message(context)},
            ],
            max_tokens=250,
            temperature=0.4,
            timeout=10,
        )
        return response.choices[0].message.content.strip()
    except Exception:
        return None
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && python -m pytest tests/test_notes_generator.py -v
```

Expected output:
```
tests/test_notes_generator.py::test_returns_none_when_key_is_dummy PASSED
tests/test_notes_generator.py::test_returns_generated_string_on_success PASSED
tests/test_notes_generator.py::test_returns_none_on_openai_exception PASSED
tests/test_notes_generator.py::test_build_user_message_formats_cost PASSED
tests/test_notes_generator.py::test_build_user_message_handles_missing_fields PASSED
5 passed
```

- [ ] **Step 5: Commit**

```bash
cd backend && git add app/services/ai/notes_generator.py tests/test_notes_generator.py
git commit -m "feat: add GPT-4o procurement notes generator service"
```

---

## Task 2: Wire notes generator into `multi_publish`

**Files:**
- Modify: `backend/app/api/v1/routes/onboarding.py`
- Modify: `backend/tests/test_onboarding.py`

- [ ] **Step 1: Write the failing integration tests**

Add to the bottom of `backend/tests/test_onboarding.py`:

```python
@pytest.mark.asyncio
async def test_multi_publish_generates_notes_when_blank(client, admin_token, db):
    """When notes is None on the line item, the generator is called and the result is persisted."""
    from sqlalchemy import select
    from app.models.contracts import Entitlement
    from unittest.mock import AsyncMock, patch

    h = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "vendor_name": "TestVendor",
        "po_number": "PO-NOTES-GEN-001",
        "line_items": [
            {
                "contract_name": "TestSW Notes License",
                "primary_sw_name": "TestSWNotes",
                "deployment": "cloud",
                "gxp_flag": "no",
            }
        ],
    }

    with patch(
        "app.api.v1.routes.onboarding.generate_entitlement_notes",
        new_callable=AsyncMock,
        return_value="Generated procurement note for testing.",
    ) as mock_gen:
        resp = await client.post("/api/v1/onboarding/multi-publish", json=payload, headers=h)

    assert resp.status_code == 201, resp.text
    ent_id = resp.json()["created"][0]["ent_id"]
    mock_gen.assert_called_once()

    result = await db.execute(select(Entitlement).where(Entitlement.ent_id == ent_id))
    ent = result.scalar_one()
    assert ent.notes == "Generated procurement note for testing."


@pytest.mark.asyncio
async def test_multi_publish_skips_generator_when_notes_present(client, admin_token):
    """When the line item already has notes, the generator is NOT called."""
    from unittest.mock import AsyncMock, patch

    h = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "vendor_name": "TestVendor",
        "po_number": "PO-NOTES-SKIP-001",
        "line_items": [
            {
                "contract_name": "TestSW Existing Notes",
                "primary_sw_name": "TestSWExistingNotes",
                "notes": "Existing handwritten note.",
                "deployment": "cloud",
                "gxp_flag": "no",
            }
        ],
    }

    with patch(
        "app.api.v1.routes.onboarding.generate_entitlement_notes",
        new_callable=AsyncMock,
        return_value="Should not appear.",
    ) as mock_gen:
        resp = await client.post("/api/v1/onboarding/multi-publish", json=payload, headers=h)

    assert resp.status_code == 201, resp.text
    mock_gen.assert_not_called()
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && python -m pytest tests/test_onboarding.py::test_multi_publish_generates_notes_when_blank tests/test_onboarding.py::test_multi_publish_skips_generator_when_notes_present -v 2>&1 | tail -10
```

Expected: both tests FAIL (generator not yet imported or called in the route).

- [ ] **Step 3: Add batch lookups and notes generation to `multi_publish`**

In `backend/app/api/v1/routes/onboarding.py`, make the following changes:

**3a. Add import at the top of the file** (after the existing service imports on line 16):

```python
from app.services.ai.notes_generator import generate_entitlement_notes
```

**3b. Add batch lookups at the start of `multi_publish`**, immediately after the `if not body.line_items:` check (after line 327). Insert this block:

```python
    # ── Batch-resolve lookup names for AI notes context ───────────────────
    from app.models.masters import Category, SubCategory, LicenseMetric, LicenseType

    _cat_ids = {i.category_id for i in body.line_items if i.category_id}
    _sub_ids = {i.sub_category_id for i in body.line_items if i.sub_category_id}
    _metric_ids = {i.metric_id for i in body.line_items if i.metric_id}
    _lt_ids = {i.license_type_id for i in body.line_items if i.license_type_id}

    cat_names: dict = {}
    sub_names: dict = {}
    metric_names: dict = {}
    lt_names: dict = {}

    if _cat_ids:
        rows = (await db.execute(select(Category).where(Category.id.in_(_cat_ids)))).scalars().all()
        cat_names = {r.id: r.name for r in rows}
    if _sub_ids:
        rows = (await db.execute(select(SubCategory).where(SubCategory.id.in_(_sub_ids)))).scalars().all()
        sub_names = {r.id: r.name for r in rows}
    if _metric_ids:
        rows = (await db.execute(select(LicenseMetric).where(LicenseMetric.id.in_(_metric_ids)))).scalars().all()
        metric_names = {r.id: r.name for r in rows}
    if _lt_ids:
        rows = (await db.execute(select(LicenseType).where(LicenseType.id.in_(_lt_ids)))).scalars().all()
        lt_names = {r.id: r.license_type for r in rows}
```

**3c. Inside the `for item in body.line_items:` loop**, add notes generation immediately after `is_new_sw = False` (after line 335). Insert this block:

```python
            # ── Generate notes if blank ───────────────────────────────────
            notes = item.notes or None
            if not notes:
                _ctx = {
                    "primary_sw_name": item.primary_sw_name,
                    "publisher": item.publisher or body.vendor_name,
                    "contract_name": item.contract_name,
                    "category_name": cat_names.get(item.category_id) if item.category_id else None,
                    "sub_category_name": sub_names.get(item.sub_category_id) if item.sub_category_id else None,
                    "license_type_name": lt_names.get(item.license_type_id) if item.license_type_id else None,
                    "deployment": item.deployment,
                    "gxp_flag": item.gxp_flag,
                    "entitled_count": item.entitled_count,
                    "metric_name": metric_names.get(item.metric_id) if item.metric_id else None,
                    "business_units": item.business_units,
                    "regions": item.regions,
                    "vendor_name": body.vendor_name,
                    "start_date": str(body.start_date) if body.start_date else None,
                    "end_date": str(body.end_date) if body.end_date else None,
                    "annual_cost": item.annual_cost,
                    "currency": body.currency or "INR",
                    "auto_renewal_clause": body.auto_renewal_clause,
                }
                notes = await generate_entitlement_notes(_ctx)
```

**3d. Replace `notes=item.notes` with `notes=notes`** in both the `SoftwareCatalog` constructor (line ~364) and the `Entitlement` constructor (line ~430).

Find this in the `SoftwareCatalog` block:
```python
                        notes=item.notes,
```
Replace with:
```python
                        notes=notes,
```

Find this in the `Entitlement` block:
```python
                notes=item.notes,
```
Replace with:
```python
                notes=notes,
```

- [ ] **Step 4: Run the new integration tests**

```bash
cd backend && python -m pytest tests/test_onboarding.py::test_multi_publish_generates_notes_when_blank tests/test_onboarding.py::test_multi_publish_skips_generator_when_notes_present -v
```

Expected:
```
tests/test_onboarding.py::test_multi_publish_generates_notes_when_blank PASSED
tests/test_onboarding.py::test_multi_publish_skips_generator_when_notes_present PASSED
2 passed
```

- [ ] **Step 5: Run the full onboarding test suite to check for regressions**

```bash
cd backend && python -m pytest tests/test_onboarding.py -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/routes/onboarding.py backend/tests/test_onboarding.py
git commit -m "feat: wire AI notes generator into multi_publish route"
```

---

## Task 3: Frontend — loading banner and button label

**Files:**
- Modify: `frontend/src/pages/Onboarding/OnboardingPage.jsx`

This task has no unit test (visual UI change). Manually verify by inspecting the UI while a publish is in flight.

- [ ] **Step 1: Add the amber publishing banner**

In `OnboardingPage.jsx`, find the Review & Publish section opening div at approximately line 1797:

```jsx
      {/* ── Step 7: Review & Publish ─────────────────────────────────────── */}
      <div style={{ border: "2px solid var(--navy-mid)", borderRadius: 10, overflow: "hidden" }}>
```

Insert the banner **immediately before** that div:

```jsx
      {/* ── Publishing banner ──────────────────────────────────────────────── */}
      {publishing && (
        <div style={{ background: "var(--amber-l)", border: "1px solid var(--amber-m)", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "var(--amber-m)", display: "flex", alignItems: "center", gap: 8 }}>
          <span>⏳</span>
          <span>Publishing updates in progress — generating notes with AI…</span>
        </div>
      )}
```

- [ ] **Step 2: Update the publish button label**

Find the publish button label at approximately line 1866:

```jsx
              {publishing ? "Publishing…" : `Publish All (${totalItems} items) →`}
```

Replace with:

```jsx
              {publishing ? "Publishing updates in progress…" : `Publish All (${totalItems} items) →`}
```

- [ ] **Step 3: Verify manually in the browser**

Start the dev server:
```bash
cd frontend && npm run dev
```

Open the onboarding wizard, fill in at least one line item (leave Notes blank), and click Publish. Confirm:
1. The amber banner "⏳ Publishing updates in progress — generating notes with AI…" appears above the Review & Publish card
2. The button reads "Publishing updates in progress…" and is disabled
3. Both disappear when the response arrives and the success screen renders

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Onboarding/OnboardingPage.jsx
git commit -m "feat: add publishing banner and updated button label for AI notes generation"
```

---

## Self-Review Checklist (completed inline)

**Spec coverage:**
- ✅ `generate_entitlement_notes(context)` in new service file — Task 1
- ✅ All 17 context fields assembled from payload + batch lookups — Task 2 Step 3c
- ✅ Blank-notes check: `not notes` covers both `None` and `""` — Task 2 Step 3c
- ✅ Notes written to both `SoftwareCatalog.notes` and `Entitlement.notes` — Task 2 Step 3d
- ✅ Failure swallowed, returns `None`, publish proceeds — Task 1 Step 3 (`except Exception: return None`)
- ✅ `dummy` key short-circuits without calling OpenAI — Task 1 Step 3
- ✅ 10 s timeout, temperature 0.4, max_tokens 250 — Task 1 Step 3
- ✅ Amber banner — Task 3 Step 1
- ✅ Updated button label — Task 3 Step 2

**Type consistency:** `generate_entitlement_notes` signature is `(context: dict) -> str | None` throughout all tasks. The `notes` local variable used in Task 2 is `str | None`, matching both constructor fields (`Text, nullable=True`).

**Placeholder scan:** No TBDs, all code blocks complete.
