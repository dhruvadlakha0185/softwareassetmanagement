# Software Catalog + Contract Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Software Catalog CRUD API+UI and a 7-step contract onboarding wizard with OpenAI GPT-4o contract text extraction.

**Architecture:** FastAPI routes for catalog CRUD and onboarding wizard; an AI service wraps OpenAI gpt-4o to extract vendor/PO/line-items from uploaded PDF/DOCX text; React pages replace the existing placeholders — CatalogPage renders a filterable table with a detail drawer, OnboardingPage is a stateful multi-step wizard that calls the AI extraction endpoint and publishes to create SW catalog + contract + entitlement records.

**Tech Stack:** FastAPI · SQLAlchemy 2.0 async · Pydantic v2 · openai>=1.54.0 · PyPDF2>=3.0.1 · python-docx>=1.1.0 · React 18 · Axios · DRL CSS design system

---

## File Map

**Create:**
- `backend/app/schemas/catalog.py` — Pydantic schemas for SoftwareCatalog + SoftwareAlias
- `backend/app/schemas/onboarding.py` — Pydantic schemas for OnboardingDraft + publish payload
- `backend/app/services/__init__.py` — empty package marker
- `backend/app/services/ai/__init__.py` — empty package marker
- `backend/app/services/ai/contract_extractor.py` — extract_contract_text() + call_openai()
- `backend/app/api/v1/routes/catalog.py` — CRUD + alias endpoints for /catalog
- `backend/app/api/v1/routes/onboarding.py` — /onboarding/extract, drafts CRUD, /onboarding/publish
- `backend/tests/test_catalog.py` — catalog API tests
- `backend/tests/test_onboarding.py` — onboarding API tests with mocked OpenAI
- `frontend/src/api/catalog.js` — Axios wrappers for catalog endpoints
- `frontend/src/api/onboarding.js` — Axios wrappers for onboarding endpoints

**Modify:**
- `backend/requirements.txt` — add openai, PyPDF2, python-docx
- `backend/app/main.py` — register catalog_router + onboarding_router
- `backend/scripts/seed.py` — add 12 seed catalog entries

---

## Task 1: Add AI/document dependencies to requirements.txt

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add three new lines to requirements.txt**

Replace the existing `backend/requirements.txt` with:

```
fastapi==0.115.5
uvicorn[standard]==0.32.1
sqlalchemy[asyncio]==2.0.36
asyncpg==0.30.0
alembic==1.14.0
pydantic-settings==2.6.1
python-jose[cryptography]==3.3.0
argon2-cffi==23.1.0
python-multipart==0.0.17
httpx==0.27.2
pytest==8.3.4
pytest-asyncio==0.24.0
anyio==4.6.2
openai>=1.54.0
PyPDF2>=3.0.1
python-docx>=1.1.0
```

- [ ] **Step 2: Install in the backend virtual environment**

```bash
cd backend
pip install openai "PyPDF2>=3.0.1" python-docx
```

Expected: three packages install cleanly, no conflicts.

- [ ] **Step 3: Verify import**

```bash
python -c "import openai; import PyPDF2; import docx; print('OK')"
```

Expected output: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt
git commit -m "feat: add openai, PyPDF2, python-docx for contract extraction"
```

---

## Task 2: Catalog Pydantic schemas

**Files:**
- Create: `backend/app/schemas/catalog.py`

- [ ] **Step 1: Write the schema file**

Create `backend/app/schemas/catalog.py`:

```python
from __future__ import annotations
from datetime import date
from uuid import UUID
from pydantic import BaseModel


class SoftwareAliasOut(BaseModel):
    id: UUID
    sw_id: str
    alias_name: str
    source_name: str | None = None
    model_config = {"from_attributes": True}


class SoftwareAliasCreate(BaseModel):
    alias_name: str
    source_name: str | None = None


class SoftwareCatalogCreate(BaseModel):
    canonical_name: str
    publisher: str | None = None
    category_id: UUID | None = None
    sub_category_id: UUID | None = None
    gxp_flag: str = "no"           # no | yes_21cfr | yes_annex11 | yes_both
    vendor_id: UUID | None = None
    vendor_risk: str = "LOW"       # LOW | MEDIUM | HIGH
    deployment: str = "cloud"      # cloud | on_premise | desktop_cloud | hybrid
    region_id: UUID | None = None
    app_owner_id: UUID | None = None
    notes: str | None = None
    onboarded_date: date | None = None


class SoftwareCatalogUpdate(BaseModel):
    canonical_name: str | None = None
    publisher: str | None = None
    category_id: UUID | None = None
    sub_category_id: UUID | None = None
    gxp_flag: str | None = None
    vendor_id: UUID | None = None
    vendor_risk: str | None = None
    deployment: str | None = None
    region_id: UUID | None = None
    app_owner_id: UUID | None = None
    notes: str | None = None


class SoftwareCatalogOut(BaseModel):
    sw_id: str
    canonical_name: str
    publisher: str | None = None
    category_id: UUID | None = None
    sub_category_id: UUID | None = None
    gxp_flag: str
    vendor_id: UUID | None = None
    vendor_risk: str
    deployment: str
    region_id: UUID | None = None
    app_owner_id: UUID | None = None
    notes: str | None = None
    onboarded_date: date | None = None
    aliases: list[SoftwareAliasOut] = []
    model_config = {"from_attributes": True}


class SoftwareCatalogBrief(BaseModel):
    sw_id: str
    canonical_name: str
    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Verify import**

```bash
cd backend
python -c "from app.schemas.catalog import SoftwareCatalogCreate, SoftwareCatalogOut; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/catalog.py
git commit -m "feat: catalog Pydantic schemas"
```

---

## Task 3: Catalog router + wire into main.py

**Files:**
- Create: `backend/app/api/v1/routes/catalog.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create the catalog router**

Create `backend/app/api/v1/routes/catalog.py`:

```python
from uuid import UUID
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.api.deps import get_current_user, require_role
from app.models.catalog import SoftwareCatalog, SoftwareAlias
from app.schemas.catalog import (
    SoftwareCatalogCreate, SoftwareCatalogUpdate, SoftwareCatalogOut,
    SoftwareCatalogBrief, SoftwareAliasCreate, SoftwareAliasOut,
)

router = APIRouter(prefix="/catalog", tags=["catalog"])
admin_only = Depends(require_role(["COE_ADMIN"]))


async def _next_sw_id(db: AsyncSession) -> str:
    result = await db.execute(
        select(func.max(SoftwareCatalog.sw_id)).where(SoftwareCatalog.sw_id.like("SW-%"))
    )
    max_id = result.scalar_one_or_none()
    n = int(max_id.split("-")[1]) + 1 if max_id else 1
    return f"SW-{n:03d}"


async def _load_out(sw: SoftwareCatalog, db: AsyncSession) -> SoftwareCatalogOut:
    aliases_result = await db.execute(
        select(SoftwareAlias).where(SoftwareAlias.sw_id == sw.sw_id)
    )
    aliases = [SoftwareAliasOut.model_validate(a) for a in aliases_result.scalars().all()]
    data = SoftwareCatalogOut.model_validate(sw)
    data.aliases = aliases
    return data


@router.get("", response_model=list[SoftwareCatalogOut])
async def list_catalog(
    search: str | None = Query(None),
    category_id: UUID | None = Query(None),
    gxp_flag: str | None = Query(None),
    vendor_risk: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(SoftwareCatalog)
    if search:
        q = q.where(SoftwareCatalog.canonical_name.ilike(f"%{search}%"))
    if category_id:
        q = q.where(SoftwareCatalog.category_id == category_id)
    if gxp_flag:
        q = q.where(SoftwareCatalog.gxp_flag == gxp_flag)
    if vendor_risk:
        q = q.where(SoftwareCatalog.vendor_risk == vendor_risk)
    result = await db.execute(q.order_by(SoftwareCatalog.sw_id))
    rows = result.scalars().all()
    return [await _load_out(sw, db) for sw in rows]


@router.get("/brief", response_model=list[SoftwareCatalogBrief])
async def list_catalog_brief(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SoftwareCatalog).order_by(SoftwareCatalog.canonical_name)
    )
    return [SoftwareCatalogBrief.model_validate(sw) for sw in result.scalars().all()]


@router.get("/{sw_id}", response_model=SoftwareCatalogOut)
async def get_catalog_entry(sw_id: str, db: AsyncSession = Depends(get_db)):
    sw = await db.get(SoftwareCatalog, sw_id)
    if not sw:
        raise HTTPException(status_code=404, detail="Software entry not found")
    return await _load_out(sw, db)


@router.post("", response_model=SoftwareCatalogOut, status_code=201, dependencies=[admin_only])
async def create_catalog_entry(
    body: SoftwareCatalogCreate,
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(
        select(SoftwareCatalog).where(SoftwareCatalog.canonical_name == body.canonical_name)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Canonical name already exists")
    sw_id = await _next_sw_id(db)
    sw = SoftwareCatalog(
        sw_id=sw_id,
        onboarded_date=body.onboarded_date or date.today(),
        **{k: v for k, v in body.model_dump().items() if k != "onboarded_date"},
    )
    db.add(sw)
    await db.commit()
    await db.refresh(sw)
    return await _load_out(sw, db)


@router.put("/{sw_id}", response_model=SoftwareCatalogOut, dependencies=[admin_only])
async def update_catalog_entry(
    sw_id: str,
    body: SoftwareCatalogUpdate,
    db: AsyncSession = Depends(get_db),
):
    sw = await db.get(SoftwareCatalog, sw_id)
    if not sw:
        raise HTTPException(status_code=404, detail="Software entry not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(sw, k, v)
    await db.commit()
    await db.refresh(sw)
    return await _load_out(sw, db)


@router.delete("/{sw_id}", status_code=204, dependencies=[admin_only])
async def delete_catalog_entry(sw_id: str, db: AsyncSession = Depends(get_db)):
    sw = await db.get(SoftwareCatalog, sw_id)
    if not sw:
        raise HTTPException(status_code=404, detail="Software entry not found")
    await db.delete(sw)
    await db.commit()


@router.post("/{sw_id}/aliases", response_model=SoftwareAliasOut, status_code=201, dependencies=[admin_only])
async def add_alias(sw_id: str, body: SoftwareAliasCreate, db: AsyncSession = Depends(get_db)):
    sw = await db.get(SoftwareCatalog, sw_id)
    if not sw:
        raise HTTPException(status_code=404, detail="Software entry not found")
    alias = SoftwareAlias(sw_id=sw_id, **body.model_dump())
    db.add(alias)
    await db.commit()
    await db.refresh(alias)
    return SoftwareAliasOut.model_validate(alias)


@router.delete("/aliases/{alias_id}", status_code=204, dependencies=[admin_only])
async def delete_alias(alias_id: UUID, db: AsyncSession = Depends(get_db)):
    alias = await db.get(SoftwareAlias, alias_id)
    if not alias:
        raise HTTPException(status_code=404, detail="Alias not found")
    await db.delete(alias)
    await db.commit()
```

- [ ] **Step 2: Wire catalog router into main.py**

Edit `backend/app/main.py` — add the import and include_router call:

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.routes.auth import router as auth_router
from app.api.v1.routes.masters import router as masters_router
from app.api.v1.routes.owners import router as owners_router
from app.api.v1.routes.catalog import router as catalog_router
from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.storage_backend in ("supabase", "local"):
        try:
            from scripts.seed import seed
            await seed()
        except Exception as e:
            print(f"Seed skipped: {e}")
    yield


app = FastAPI(
    title="DRL SAM Platform API",
    version="3.0.0",
    description="Software Asset Management — Dr. Reddy's Laboratories",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(masters_router, prefix="/api/v1")
app.include_router(owners_router, prefix="/api/v1")
app.include_router(catalog_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "drl-sam-backend"}
```

- [ ] **Step 3: Verify server starts with no import errors**

```bash
cd backend
uvicorn app.main:app --port 8001 --reload &
sleep 2
curl -s http://localhost:8001/health
kill %1
```

Expected: `{"status":"ok","service":"drl-sam-backend"}`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/routes/catalog.py backend/app/main.py
git commit -m "feat: catalog CRUD router (SW-NNN sequential IDs, alias endpoints)"
```

---

## Task 4: AI contract extractor service

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/ai/__init__.py`
- Create: `backend/app/services/ai/contract_extractor.py`

- [ ] **Step 1: Create package markers**

Create `backend/app/services/__init__.py` (empty file):
```python
```

Create `backend/app/services/ai/__init__.py` (empty file):
```python
```

- [ ] **Step 2: Create the extractor service**

Create `backend/app/services/ai/contract_extractor.py`:

```python
"""
Extract contract metadata from PDF/DOCX bytes using OpenAI gpt-4o (JSON mode).
Returns a dict matching ExtractedContract schema.
"""
import io
import json
from app.core.config import settings

SYSTEM_PROMPT = """You are a software license contract analyst for Dr. Reddy's Laboratories.
Extract the following fields from the contract text and return ONLY valid JSON.
If a field is not found, use null.
Dates must be in YYYY-MM-DD format.
license_type must be "subscription" or "perpetual" or null.
auto_renewal_clause must be "yes", "no", or "opt_in" or null."""

SCHEMA = """{
  "vendor_name": "string or null",
  "po_number": "string or null",
  "clm_id": "string or null",
  "start_date": "YYYY-MM-DD or null",
  "end_date": "YYYY-MM-DD or null",
  "auto_renewal_clause": "yes|no|opt_in or null",
  "total_value_inr": "integer or null",
  "reseller": "string or null",
  "line_items": [
    {
      "contract_name": "string",
      "metric": "string or null",
      "license_type": "subscription|perpetual or null",
      "entitled_count": "integer or null",
      "unit_cost_inr": "integer or null",
      "annual_cost_inr": "integer or null"
    }
  ]
}"""


def _extract_text_from_pdf(data: bytes) -> str:
    import PyPDF2
    reader = PyPDF2.PdfReader(io.BytesIO(data))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages)[:12000]


def _extract_text_from_docx(data: bytes) -> str:
    import docx
    doc = docx.Document(io.BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs)[:12000]


def extract_contract_text(filename: str, data: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return _extract_text_from_pdf(data)
    if lower.endswith(".docx") or lower.endswith(".doc"):
        return _extract_text_from_docx(data)
    raise ValueError(f"Unsupported file type: {filename}. Upload PDF or DOCX.")


async def call_openai(text: str) -> dict:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response = await client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": f"{SYSTEM_PROMPT}\n\nReturn JSON matching this schema:\n{SCHEMA}"},
            {"role": "user", "content": f"Contract text:\n\n{text}"},
        ],
        temperature=0,
    )
    raw = response.choices[0].message.content
    return json.loads(raw)
```

- [ ] **Step 3: Verify import**

```bash
cd backend
python -c "from app.services.ai.contract_extractor import extract_contract_text, call_openai; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/ 
git commit -m "feat: AI contract extractor service (PyPDF2 + python-docx + gpt-4o)"
```

---

## Task 5: Onboarding Pydantic schemas

**Files:**
- Create: `backend/app/schemas/onboarding.py`

- [ ] **Step 1: Create the onboarding schemas**

Create `backend/app/schemas/onboarding.py`:

```python
from __future__ import annotations
from datetime import date
from uuid import UUID
from pydantic import BaseModel


class LineItemIn(BaseModel):
    contract_name: str
    metric: str | None = None
    license_type: str = "subscription"   # subscription | perpetual
    entitled_count: int | None = None
    unit_cost_inr: int | None = None
    annual_cost_inr: int | None = None
    region_id: UUID | None = None
    discovery_source_id: UUID | None = None
    usage_method_id: UUID | None = None
    app_owner_id: UUID | None = None
    # Canonical mapping — filled in Step 4 of wizard
    canonical_name: str | None = None
    sw_id: str | None = None             # existing SW entry to attach to


class DraftSave(BaseModel):
    po_number: str | None = None
    form_data_json: dict | None = None   # full wizard state blob
    current_step: int = 1


class DraftOut(BaseModel):
    id: UUID
    user_id: UUID
    po_number: str | None = None
    form_data_json: dict | None = None
    current_step: int
    model_config = {"from_attributes": True}


class PublishPayload(BaseModel):
    # Step 2 — contract metadata
    po_number: str | None = None
    clm_id: str | None = None
    vendor_id: UUID | None = None
    reseller: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    total_value_inr: int | None = None
    auto_renewal_clause: str | None = None  # yes | no | opt_in
    file_name: str | None = None
    file_path: str | None = None
    # Step 4 — canonical mapping
    canonical_name: str                  # required — new or existing
    sw_id: str | None = None             # if mapping to existing SW entry
    # New SW fields (used when sw_id is None)
    publisher: str | None = None
    category_id: UUID | None = None
    sub_category_id: UUID | None = None
    gxp_flag: str = "no"
    vendor_risk: str = "LOW"
    deployment: str = "cloud"
    region_id: UUID | None = None
    app_owner_id: UUID | None = None
    notes: str | None = None
    # Step 3 — line items
    line_items: list[LineItemIn] = []
    # Step 6 — aliases to add
    aliases: list[str] = []


class PublishOut(BaseModel):
    sw_id: str
    contract_id: UUID
    ent_ids: list[str]
```

- [ ] **Step 2: Verify import**

```bash
cd backend
python -c "from app.schemas.onboarding import PublishPayload, DraftOut; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/onboarding.py
git commit -m "feat: onboarding Pydantic schemas (draft + publish)"
```

---

## Task 6: Onboarding router + wire into main.py + seed catalog

**Files:**
- Create: `backend/app/api/v1/routes/onboarding.py`
- Modify: `backend/app/main.py`
- Modify: `backend/scripts/seed.py`

- [ ] **Step 1: Create the onboarding router**

Create `backend/app/api/v1/routes/onboarding.py`:

```python
from uuid import UUID
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.api.deps import get_current_user, require_role
from app.models.catalog import SoftwareCatalog, SoftwareAlias
from app.models.contracts import Contract, Entitlement, OnboardingDraft
from app.schemas.onboarding import DraftSave, DraftOut, PublishPayload, PublishOut
from app.services.ai.contract_extractor import extract_contract_text, call_openai

router = APIRouter(prefix="/onboarding", tags=["onboarding"])
auth = Depends(get_current_user)
admin_only = Depends(require_role(["COE_ADMIN"]))


async def _next_sw_id(db: AsyncSession) -> str:
    result = await db.execute(
        select(func.max(SoftwareCatalog.sw_id)).where(SoftwareCatalog.sw_id.like("SW-%"))
    )
    max_id = result.scalar_one_or_none()
    n = int(max_id.split("-")[1]) + 1 if max_id else 1
    return f"SW-{n:03d}"


async def _next_ent_id(db: AsyncSession) -> str:
    result = await db.execute(
        select(func.max(Entitlement.ent_id)).where(Entitlement.ent_id.like("ENT-%"))
    )
    max_id = result.scalar_one_or_none()
    n = int(max_id.split("-")[1]) + 1 if max_id else 1
    return f"ENT-{n:03d}"


# ── AI Extraction ──────────────────────────────────────────────────────────────

@router.post("/extract")
async def extract_contract(
    file: UploadFile = File(...),
    current_user=auth,
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    data = await file.read()
    try:
        text = extract_contract_text(file.filename, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    result = await call_openai(text)
    return result


# ── Drafts ─────────────────────────────────────────────────────────────────────

@router.get("/drafts", response_model=list[DraftOut])
async def list_drafts(current_user=auth, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(OnboardingDraft).where(OnboardingDraft.user_id == current_user.id)
    )
    return [DraftOut.model_validate(d) for d in result.scalars().all()]


@router.post("/drafts", response_model=DraftOut, status_code=201)
async def create_draft(
    body: DraftSave,
    current_user=auth,
    db: AsyncSession = Depends(get_db),
):
    draft = OnboardingDraft(user_id=current_user.id, **body.model_dump())
    db.add(draft)
    await db.commit()
    await db.refresh(draft)
    return DraftOut.model_validate(draft)


@router.get("/drafts/{draft_id}", response_model=DraftOut)
async def get_draft(
    draft_id: UUID,
    current_user=auth,
    db: AsyncSession = Depends(get_db),
):
    draft = await db.get(OnboardingDraft, draft_id)
    if not draft or draft.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    return DraftOut.model_validate(draft)


@router.put("/drafts/{draft_id}", response_model=DraftOut)
async def update_draft(
    draft_id: UUID,
    body: DraftSave,
    current_user=auth,
    db: AsyncSession = Depends(get_db),
):
    draft = await db.get(OnboardingDraft, draft_id)
    if not draft or draft.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(draft, k, v)
    await db.commit()
    await db.refresh(draft)
    return DraftOut.model_validate(draft)


@router.delete("/drafts/{draft_id}", status_code=204)
async def delete_draft(
    draft_id: UUID,
    current_user=auth,
    db: AsyncSession = Depends(get_db),
):
    draft = await db.get(OnboardingDraft, draft_id)
    if not draft or draft.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    await db.delete(draft)
    await db.commit()


# ── Publish ────────────────────────────────────────────────────────────────────

@router.post("/publish", response_model=PublishOut, status_code=201)
async def publish_onboarding(
    body: PublishPayload,
    current_user=auth,
    db: AsyncSession = Depends(get_db),
):
    # Resolve or create SW catalog entry
    if body.sw_id:
        sw = await db.get(SoftwareCatalog, body.sw_id)
        if not sw:
            raise HTTPException(status_code=404, detail=f"SW entry {body.sw_id} not found")
        sw_id = body.sw_id
    else:
        existing = (await db.execute(
            select(SoftwareCatalog).where(SoftwareCatalog.canonical_name == body.canonical_name)
        )).scalar_one_or_none()
        if existing:
            sw_id = existing.sw_id
        else:
            sw_id = await _next_sw_id(db)
            sw = SoftwareCatalog(
                sw_id=sw_id,
                canonical_name=body.canonical_name,
                publisher=body.publisher,
                category_id=body.category_id,
                sub_category_id=body.sub_category_id,
                gxp_flag=body.gxp_flag,
                vendor_id=body.vendor_id,
                vendor_risk=body.vendor_risk,
                deployment=body.deployment,
                region_id=body.region_id,
                app_owner_id=body.app_owner_id,
                notes=body.notes,
                onboarded_date=date.today(),
                created_by=current_user.id,
            )
            db.add(sw)
            await db.flush()

    # Add aliases (Step 6)
    for alias_name in body.aliases:
        existing_alias = (await db.execute(
            select(SoftwareAlias).where(
                SoftwareAlias.sw_id == sw_id,
                SoftwareAlias.alias_name == alias_name,
            )
        )).scalar_one_or_none()
        if not existing_alias:
            db.add(SoftwareAlias(sw_id=sw_id, alias_name=alias_name, source_name="onboarding"))

    # Create contract record
    contract = Contract(
        sw_id=sw_id,
        po_number=body.po_number,
        clm_id=body.clm_id,
        vendor_id=body.vendor_id,
        reseller=body.reseller,
        start_date=body.start_date,
        end_date=body.end_date,
        total_value_inr=body.total_value_inr,
        auto_renewal_clause=body.auto_renewal_clause,
        file_name=body.file_name,
        file_path=body.file_path,
        storage_backend="supabase",
        created_by=current_user.id,
    )
    db.add(contract)
    await db.flush()

    # Create entitlement for each line item
    ent_ids = []
    for item in body.line_items:
        ent_id = await _next_ent_id(db)
        ent = Entitlement(
            ent_id=ent_id,
            sw_id=sw_id,
            contract_id=contract.id,
            contract_name=item.contract_name,
            license_type=item.license_type,
            entitled_count=item.entitled_count,
            unit_cost_inr=item.unit_cost_inr,
            annual_cost_inr=item.annual_cost_inr,
            region_id=item.region_id,
            discovery_source_id=item.discovery_source_id,
            usage_method_id=item.usage_method_id,
            app_owner_id=item.app_owner_id,
            status="ACTIVE",
        )
        db.add(ent)
        ent_ids.append(ent_id)

    await db.commit()
    return PublishOut(sw_id=sw_id, contract_id=contract.id, ent_ids=ent_ids)
```

- [ ] **Step 2: Wire onboarding router into main.py**

Edit `backend/app/main.py` to add the onboarding router (full file):

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.routes.auth import router as auth_router
from app.api.v1.routes.masters import router as masters_router
from app.api.v1.routes.owners import router as owners_router
from app.api.v1.routes.catalog import router as catalog_router
from app.api.v1.routes.onboarding import router as onboarding_router
from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.storage_backend in ("supabase", "local"):
        try:
            from scripts.seed import seed
            await seed()
        except Exception as e:
            print(f"Seed skipped: {e}")
    yield


app = FastAPI(
    title="DRL SAM Platform API",
    version="3.0.0",
    description="Software Asset Management — Dr. Reddy's Laboratories",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(masters_router, prefix="/api/v1")
app.include_router(owners_router, prefix="/api/v1")
app.include_router(catalog_router, prefix="/api/v1")
app.include_router(onboarding_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "drl-sam-backend"}
```

- [ ] **Step 3: Add 12 seed catalog entries to seed.py**

Add the following to `backend/scripts/seed.py`.

After the `SEED_REGIONS` block, add:

```python
# ── Software Catalog ───────────────────────────────────────────────────────────
SEED_CATALOG = [
    {"sw_id": "SW-001", "canonical_name": "Microsoft 365",          "publisher": "Microsoft",      "gxp_flag": "no",        "vendor_risk": "MEDIUM", "deployment": "cloud"},
    {"sw_id": "SW-002", "canonical_name": "SAP ERP (S/4HANA)",      "publisher": "SAP",            "gxp_flag": "yes_21cfr", "vendor_risk": "HIGH",   "deployment": "on_premise"},
    {"sw_id": "SW-003", "canonical_name": "Oracle Database 19c",    "publisher": "Oracle",         "gxp_flag": "yes_21cfr", "vendor_risk": "HIGH",   "deployment": "on_premise"},
    {"sw_id": "SW-004", "canonical_name": "LabWare LIMS",           "publisher": "LabWare",        "gxp_flag": "yes_21cfr", "vendor_risk": "LOW",    "deployment": "on_premise"},
    {"sw_id": "SW-005", "canonical_name": "Veeva Vault QMS",        "publisher": "Veeva Systems",  "gxp_flag": "yes_both",  "vendor_risk": "LOW",    "deployment": "cloud"},
    {"sw_id": "SW-006", "canonical_name": "Windows Server 2022",    "publisher": "Microsoft",      "gxp_flag": "no",        "vendor_risk": "MEDIUM", "deployment": "on_premise"},
    {"sw_id": "SW-007", "canonical_name": "CrowdStrike Falcon EDR", "publisher": "CrowdStrike",    "gxp_flag": "no",        "vendor_risk": "LOW",    "deployment": "cloud"},
    {"sw_id": "SW-008", "canonical_name": "ServiceNow ITSM",        "publisher": "ServiceNow",     "gxp_flag": "no",        "vendor_risk": "LOW",    "deployment": "cloud"},
    {"sw_id": "SW-009", "canonical_name": "Broadcom VMware vSphere","publisher": "Broadcom",       "gxp_flag": "no",        "vendor_risk": "HIGH",   "deployment": "on_premise"},
    {"sw_id": "SW-010", "canonical_name": "Adobe Acrobat DC",       "publisher": "Adobe",          "gxp_flag": "no",        "vendor_risk": "LOW",    "deployment": "desktop_cloud"},
    {"sw_id": "SW-011", "canonical_name": "AVEVA PI System",        "publisher": "AVEVA",          "gxp_flag": "yes_annex11","vendor_risk": "LOW",   "deployment": "on_premise"},
    {"sw_id": "SW-012", "canonical_name": "Koerber PAS-X MES",      "publisher": "Koerber Pharma", "gxp_flag": "yes_both",  "vendor_risk": "LOW",    "deployment": "on_premise"},
]
```

In the `seed()` function, after the DOA hierarchy block and before `await session.commit()`, add:

```python
        # Software Catalog
        from app.models.catalog import SoftwareCatalog
        for item in SEED_CATALOG:
            existing = (await session.execute(
                select(SoftwareCatalog).where(SoftwareCatalog.sw_id == item["sw_id"])
            )).scalar_one_or_none()
            if existing:
                print(f"  skip   catalog:{item['sw_id']}")
            else:
                session.add(SoftwareCatalog(**item))
                print(f"  create catalog:{item['sw_id']} — {item['canonical_name']}")
```

- [ ] **Step 4: Verify server starts with all 5 routers**

```bash
cd backend
uvicorn app.main:app --port 8001 &
sleep 2
curl -s http://localhost:8001/api/v1/catalog | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} catalog entries')"
kill %1
```

Expected: `12 catalog entries`

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/routes/onboarding.py backend/app/main.py backend/scripts/seed.py
git commit -m "feat: onboarding router (extract/drafts/publish) + 12 seed catalog entries"
```

---

## Task 7: Catalog API tests

**Files:**
- Create: `backend/tests/test_catalog.py`

- [ ] **Step 1: Write test file**

Create `backend/tests/test_catalog.py`:

```python
import pytest


async def test_list_catalog_returns_list(client):
    resp = await client.get("/api/v1/catalog")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_create_catalog_requires_admin(client):
    resp = await client.post("/api/v1/catalog", json={"canonical_name": "Test SW"})
    assert resp.status_code == 403


async def test_create_and_get_catalog_entry(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post("/api/v1/catalog", json={
        "canonical_name": "Test Software Alpha",
        "publisher": "ACME Corp",
        "gxp_flag": "no",
        "vendor_risk": "LOW",
        "deployment": "cloud",
    }, headers=h)
    assert resp.status_code == 201
    sw = resp.json()
    assert sw["canonical_name"] == "Test Software Alpha"
    assert sw["sw_id"].startswith("SW-")

    get_resp = await client.get(f"/api/v1/catalog/{sw['sw_id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["canonical_name"] == "Test Software Alpha"

    # cleanup
    await client.delete(f"/api/v1/catalog/{sw['sw_id']}", headers=h)


async def test_duplicate_canonical_name_returns_409(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    payload = {"canonical_name": "Dup SW Beta", "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud"}
    r1 = await client.post("/api/v1/catalog", json=payload, headers=h)
    assert r1.status_code == 201
    r2 = await client.post("/api/v1/catalog", json=payload, headers=h)
    assert r2.status_code == 409
    await client.delete(f"/api/v1/catalog/{r1.json()['sw_id']}", headers=h)


async def test_update_catalog_entry(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    create = await client.post("/api/v1/catalog", json={
        "canonical_name": "Update Test SW",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
    }, headers=h)
    sw_id = create.json()["sw_id"]

    update = await client.put(f"/api/v1/catalog/{sw_id}", json={"notes": "Updated note"}, headers=h)
    assert update.status_code == 200
    assert update.json()["notes"] == "Updated note"

    await client.delete(f"/api/v1/catalog/{sw_id}", headers=h)


async def test_add_and_delete_alias(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    sw = (await client.post("/api/v1/catalog", json={
        "canonical_name": "Alias Test SW",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
    }, headers=h)).json()
    sw_id = sw["sw_id"]

    alias_resp = await client.post(f"/api/v1/catalog/{sw_id}/aliases",
                                   json={"alias_name": "AliasTestAlias", "source_name": "test"},
                                   headers=h)
    assert alias_resp.status_code == 201
    alias_id = alias_resp.json()["id"]

    # alias appears on GET
    entry = (await client.get(f"/api/v1/catalog/{sw_id}")).json()
    assert any(a["alias_name"] == "AliasTestAlias" for a in entry["aliases"])

    del_alias = await client.delete(f"/api/v1/catalog/aliases/{alias_id}", headers=h)
    assert del_alias.status_code == 204

    await client.delete(f"/api/v1/catalog/{sw_id}", headers=h)


async def test_sw_ids_are_sequential(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    sw1 = (await client.post("/api/v1/catalog", json={
        "canonical_name": "SeqTest1", "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
    }, headers=h)).json()
    sw2 = (await client.post("/api/v1/catalog", json={
        "canonical_name": "SeqTest2", "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
    }, headers=h)).json()
    n1 = int(sw1["sw_id"].split("-")[1])
    n2 = int(sw2["sw_id"].split("-")[1])
    assert n2 == n1 + 1

    await client.delete(f"/api/v1/catalog/{sw1['sw_id']}", headers=h)
    await client.delete(f"/api/v1/catalog/{sw2['sw_id']}", headers=h)


async def test_brief_endpoint(client):
    resp = await client.get("/api/v1/catalog/brief")
    assert resp.status_code == 200
    if resp.json():
        item = resp.json()[0]
        assert "sw_id" in item
        assert "canonical_name" in item
```

- [ ] **Step 2: Run catalog tests**

```bash
cd backend
pytest tests/test_catalog.py -v
```

Expected: All 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_catalog.py
git commit -m "test: catalog API — CRUD, alias, sequential SW-IDs"
```

---

## Task 8: Onboarding API tests (mocked OpenAI)

**Files:**
- Create: `backend/tests/test_onboarding.py`

- [ ] **Step 1: Write test file**

Create `backend/tests/test_onboarding.py`:

```python
import pytest
from unittest.mock import AsyncMock, patch

MOCK_EXTRACTION = {
    "vendor_name": "Microsoft Corporation",
    "po_number": "PO-2024-001",
    "clm_id": None,
    "start_date": "2024-04-01",
    "end_date": "2025-03-31",
    "auto_renewal_clause": "yes",
    "total_value_inr": 5000000,
    "reseller": None,
    "line_items": [
        {
            "contract_name": "Microsoft 365 E3",
            "metric": "Per User",
            "license_type": "subscription",
            "entitled_count": 500,
            "unit_cost_inr": 10000,
            "annual_cost_inr": 5000000,
        }
    ],
}


async def test_extract_requires_auth(client):
    import io
    resp = await client.post("/api/v1/onboarding/extract",
                              files={"file": ("test.pdf", io.BytesIO(b"%PDF-1.4 test"), "application/pdf")})
    assert resp.status_code == 403


async def test_extract_returns_json(client, admin_token):
    import io
    h = {"Authorization": f"Bearer {admin_token}"}
    with patch("app.api.v1.routes.onboarding.call_openai", new_callable=AsyncMock) as mock_ai, \
         patch("app.api.v1.routes.onboarding.extract_contract_text", return_value="contract text") as mock_text:
        mock_ai.return_value = MOCK_EXTRACTION
        resp = await client.post(
            "/api/v1/onboarding/extract",
            files={"file": ("contract.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
            headers=h,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["po_number"] == "PO-2024-001"
    assert len(data["line_items"]) == 1


async def test_draft_lifecycle(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}

    # create
    create = await client.post("/api/v1/onboarding/drafts",
                                json={"po_number": "PO-DRAFT-01", "current_step": 2},
                                headers=h)
    assert create.status_code == 201
    draft_id = create.json()["id"]

    # get
    get_resp = await client.get(f"/api/v1/onboarding/drafts/{draft_id}", headers=h)
    assert get_resp.status_code == 200
    assert get_resp.json()["po_number"] == "PO-DRAFT-01"

    # update
    update = await client.put(f"/api/v1/onboarding/drafts/{draft_id}",
                               json={"current_step": 4},
                               headers=h)
    assert update.status_code == 200
    assert update.json()["current_step"] == 4

    # list
    drafts = (await client.get("/api/v1/onboarding/drafts", headers=h)).json()
    assert any(d["id"] == draft_id for d in drafts)

    # delete
    del_resp = await client.delete(f"/api/v1/onboarding/drafts/{draft_id}", headers=h)
    assert del_resp.status_code == 204


async def test_publish_creates_sw_contract_entitlement(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "canonical_name": "Publish Test Software",
        "publisher": "Pub Corp",
        "gxp_flag": "no",
        "vendor_risk": "LOW",
        "deployment": "cloud",
        "po_number": "PO-PUB-001",
        "start_date": "2024-01-01",
        "end_date": "2025-01-01",
        "line_items": [
            {
                "contract_name": "Publish Test E3",
                "metric": "Per User",
                "license_type": "subscription",
                "entitled_count": 100,
                "unit_cost_inr": 1000,
                "annual_cost_inr": 100000,
            }
        ],
        "aliases": ["PubTest", "PT Software"],
    }
    resp = await client.post("/api/v1/onboarding/publish", json=payload, headers=h)
    assert resp.status_code == 201
    data = resp.json()
    assert data["sw_id"].startswith("SW-")
    assert len(data["ent_ids"]) == 1
    assert data["ent_ids"][0].startswith("ENT-")

    # Verify SW entry exists with aliases
    catalog_entry = (await client.get(f"/api/v1/catalog/{data['sw_id']}")).json()
    assert catalog_entry["canonical_name"] == "Publish Test Software"
    alias_names = [a["alias_name"] for a in catalog_entry["aliases"]]
    assert "PubTest" in alias_names

    # cleanup
    await client.delete(f"/api/v1/catalog/{data['sw_id']}", headers=h)


async def test_publish_maps_to_existing_sw(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    # create SW first
    sw = (await client.post("/api/v1/catalog", json={
        "canonical_name": "Existing SW For Publish",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
    }, headers=h)).json()
    sw_id = sw["sw_id"]

    payload = {
        "canonical_name": "Existing SW For Publish",
        "sw_id": sw_id,
        "line_items": [
            {"contract_name": "Existing SW Sub", "license_type": "subscription", "entitled_count": 50}
        ],
    }
    resp = await client.post("/api/v1/onboarding/publish", json=payload, headers=h)
    assert resp.status_code == 201
    assert resp.json()["sw_id"] == sw_id

    await client.delete(f"/api/v1/catalog/{sw_id}", headers=h)
```

- [ ] **Step 2: Run onboarding tests**

```bash
cd backend
pytest tests/test_onboarding.py -v
```

Expected: All 5 tests PASS.

- [ ] **Step 3: Run full test suite**

```bash
cd backend
pytest -v
```

Expected: All tests pass (catalog + onboarding + owners + masters + auth).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_onboarding.py
git commit -m "test: onboarding API — extract (mocked), drafts, publish, alias mapping"
```

---

## Task 9: Frontend API modules

**Files:**
- Create: `frontend/src/api/catalog.js`
- Create: `frontend/src/api/onboarding.js`

- [ ] **Step 1: Create catalog.js**

Create `frontend/src/api/catalog.js`:

```js
import client from "./client";

const base = "/catalog";

export const fetchCatalog = (params = {}) =>
  client.get(base, { params }).then(r => r.data);

export const fetchCatalogBrief = () =>
  client.get(`${base}/brief`).then(r => r.data);

export const fetchCatalogEntry = (swId) =>
  client.get(`${base}/${swId}`).then(r => r.data);

export const createCatalogEntry = (data) =>
  client.post(base, data).then(r => r.data);

export const updateCatalogEntry = (swId, data) =>
  client.put(`${base}/${swId}`, data).then(r => r.data);

export const deleteCatalogEntry = (swId) =>
  client.delete(`${base}/${swId}`);

export const addAlias = (swId, data) =>
  client.post(`${base}/${swId}/aliases`, data).then(r => r.data);

export const deleteAlias = (aliasId) =>
  client.delete(`${base}/aliases/${aliasId}`);
```

- [ ] **Step 2: Create onboarding.js**

Create `frontend/src/api/onboarding.js`:

```js
import client from "./client";

const base = "/onboarding";

export const extractContract = (file) => {
  const form = new FormData();
  form.append("file", file);
  return client.post(`${base}/extract`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);
};

export const fetchDrafts = () =>
  client.get(`${base}/drafts`).then(r => r.data);

export const createDraft = (data) =>
  client.post(`${base}/drafts`, data).then(r => r.data);

export const getDraft = (id) =>
  client.get(`${base}/drafts/${id}`).then(r => r.data);

export const updateDraft = (id, data) =>
  client.put(`${base}/drafts/${id}`, data).then(r => r.data);

export const deleteDraft = (id) =>
  client.delete(`${base}/drafts/${id}`);

export const publishOnboarding = (data) =>
  client.post(`${base}/publish`, data).then(r => r.data);
```

- [ ] **Step 3: Verify build**

```bash
cd frontend
npm run build 2>&1 | tail -5
```

Expected: Build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/catalog.js frontend/src/api/onboarding.js
git commit -m "feat: frontend API modules for catalog and onboarding"
```

---

## Task 10: CatalogPage UI

**Files:**
- Modify: `frontend/src/pages/Catalog/CatalogPage.jsx`

- [ ] **Step 1: Write CatalogPage**

Replace `frontend/src/pages/Catalog/CatalogPage.jsx` with:

```jsx
import { useState, useEffect, useCallback } from "react";
import { fetchCatalog, createCatalogEntry, updateCatalogEntry, deleteCatalogEntry, addAlias, deleteAlias } from "../../api/catalog";

const GXP_BADGE = {
  "no":          <span className="tag tg3">Non-GxP</span>,
  "yes_21cfr":   <span className="tag tg1">21 CFR</span>,
  "yes_annex11": <span className="tag tg1">Annex 11</span>,
  "yes_both":    <span className="tag tg1">GxP Both</span>,
};
const RISK_BADGE = {
  "LOW":    <span className="tag tg2">LOW</span>,
  "MEDIUM": <span className="tag tg4">MEDIUM</span>,
  "HIGH":   <span className="tag tgr2">HIGH</span>,
};
const DEPLOY_LABEL = {
  cloud: "Cloud", on_premise: "On-Premise", desktop_cloud: "Desktop/Cloud", hybrid: "Hybrid",
};

const EMPTY_FORM = {
  canonical_name: "", publisher: "", gxp_flag: "no",
  vendor_risk: "LOW", deployment: "cloud", notes: "",
};

export default function CatalogPage() {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterGxp, setFilterGxp] = useState("");
  const [filterRisk, setFilterRisk] = useState("");

  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [aliasInput, setAliasInput] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (filterGxp) params.gxp_flag = filterGxp;
      if (filterRisk) params.vendor_risk = filterRisk;
      const data = await fetchCatalog(params);
      setCatalog(data);
    } finally {
      setLoading(false);
    }
  }, [search, filterGxp, filterRisk]);

  useEffect(() => { reload(); }, [reload]);

  const handleAdd = async () => {
    if (!form.canonical_name.trim()) return;
    await createCatalogEntry(form);
    setForm(EMPTY_FORM);
    setShowForm(false);
    reload();
  };

  const handleDelete = async (swId) => {
    if (!window.confirm(`Delete ${swId}? This cannot be undone.`)) return;
    await deleteCatalogEntry(swId);
    if (selected?.sw_id === swId) setSelected(null);
    reload();
  };

  const handleAddAlias = async () => {
    if (!aliasInput.trim() || !selected) return;
    await addAlias(selected.sw_id, { alias_name: aliasInput.trim(), source_name: "manual" });
    setAliasInput("");
    const updated = await fetchCatalog({ search: selected.canonical_name });
    const refreshed = updated.find(s => s.sw_id === selected.sw_id);
    if (refreshed) setSelected(refreshed);
    reload();
  };

  const handleDeleteAlias = async (aliasId) => {
    await deleteAlias(aliasId);
    const updated = await fetchCatalog({ search: selected.canonical_name });
    const refreshed = updated.find(s => s.sw_id === selected.sw_id);
    if (refreshed) setSelected(refreshed);
    reload();
  };

  return (
    <div className="page" style={{ display: "flex", gap: 0, paddingBottom: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ph">
          <div className="bc">SAM Platform <span>›</span> Software Catalog</div>
          <h1>Software Catalog</h1>
          <p>{catalog.length} software titles · canonical master list</p>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input
            className="fi2" style={{ flex: 1, minWidth: 180 }}
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="fi2" value={filterGxp} onChange={e => setFilterGxp(e.target.value)}>
            <option value="">All GxP</option>
            <option value="no">Non-GxP</option>
            <option value="yes_21cfr">21 CFR</option>
            <option value="yes_annex11">Annex 11</option>
            <option value="yes_both">GxP Both</option>
          </select>
          <select className="fi2" value={filterRisk} onChange={e => setFilterRisk(e.target.value)}>
            <option value="">All Risk</option>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>
          <button className="btn btn-p btn-sm" onClick={() => setShowForm(v => !v)}>+ Add Software</button>
        </div>

        {showForm && (
          <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div className="fr3">
              <div className="fg">
                <label className="fl">Canonical Name <span className="req">*</span></label>
                <input className="fi2" value={form.canonical_name} onChange={e => setForm(f => ({ ...f, canonical_name: e.target.value }))} placeholder="e.g. Microsoft 365" />
              </div>
              <div className="fg">
                <label className="fl">Publisher</label>
                <input className="fi2" value={form.publisher} onChange={e => setForm(f => ({ ...f, publisher: e.target.value }))} placeholder="e.g. Microsoft" />
              </div>
              <div className="fg">
                <label className="fl">GxP Flag</label>
                <select className="fi2" value={form.gxp_flag} onChange={e => setForm(f => ({ ...f, gxp_flag: e.target.value }))}>
                  <option value="no">Non-GxP</option>
                  <option value="yes_21cfr">21 CFR Part 11</option>
                  <option value="yes_annex11">Annex 11</option>
                  <option value="yes_both">Both</option>
                </select>
              </div>
            </div>
            <div className="fr3">
              <div className="fg">
                <label className="fl">Vendor Risk</label>
                <select className="fi2" value={form.vendor_risk} onChange={e => setForm(f => ({ ...f, vendor_risk: e.target.value }))}>
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                </select>
              </div>
              <div className="fg">
                <label className="fl">Deployment</label>
                <select className="fi2" value={form.deployment} onChange={e => setForm(f => ({ ...f, deployment: e.target.value }))}>
                  <option value="cloud">Cloud</option>
                  <option value="on_premise">On-Premise</option>
                  <option value="desktop_cloud">Desktop / Cloud</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div className="fg">
                <label className="fl">Notes</label>
                <input className="fi2" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
              <button className="btn btn-p btn-sm" onClick={handleAdd}>Save</button>
              <button className="btn btn-o btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>SW_ID</th><th>Canonical Name</th><th>Publisher</th>
                <th>GxP</th><th>Vendor Risk</th><th>Deployment</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="7" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
              {catalog.map(sw => (
                <tr
                  key={sw.sw_id}
                  style={{ cursor: "pointer", background: selected?.sw_id === sw.sw_id ? "var(--navy-xlt)" : undefined }}
                  onClick={() => setSelected(sw)}
                >
                  <td><code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{sw.sw_id}</code></td>
                  <td><strong>{sw.canonical_name}</strong></td>
                  <td style={{ fontSize: 11.5, color: "var(--tx-m)" }}>{sw.publisher || "—"}</td>
                  <td>{GXP_BADGE[sw.gxp_flag] ?? sw.gxp_flag}</td>
                  <td>{RISK_BADGE[sw.vendor_risk] ?? sw.vendor_risk}</td>
                  <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{DEPLOY_LABEL[sw.deployment] || sw.deployment}</td>
                  <td>
                    <div className="crud-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-d btn-sm" onClick={() => handleDelete(sw.sw_id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && catalog.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>No software entries. Add one above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div style={{
          width: 320, flexShrink: 0, borderLeft: "1px solid var(--bdr)",
          background: "var(--surf)", padding: "20px 18px", overflowY: "auto",
          position: "sticky", top: 0, height: "100vh",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <strong style={{ fontSize: 13 }}>{selected.sw_id}</strong>
            <button className="btn btn-o btn-sm" onClick={() => setSelected(null)}>✕</button>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{selected.canonical_name}</div>
          {selected.publisher && <div style={{ fontSize: 12, color: "var(--tx-m)", marginBottom: 12 }}>{selected.publisher}</div>}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
            {GXP_BADGE[selected.gxp_flag]}
            {RISK_BADGE[selected.vendor_risk]}
            <span className="tag tg3">{DEPLOY_LABEL[selected.deployment] || selected.deployment}</span>
          </div>

          {selected.notes && (
            <div style={{ fontSize: 12, color: "var(--tx-m)", marginBottom: 14, lineHeight: 1.5 }}>{selected.notes}</div>
          )}

          <div className="sdiv" style={{ fontSize: 11, marginBottom: 8 }}>Aliases ({selected.aliases?.length || 0})</div>
          {selected.aliases?.map(a => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--bdr)" }}>
              <span>{a.alias_name}</span>
              <button
                style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12 }}
                onClick={() => handleDeleteAlias(a.id)}
              >✕</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input
              className="fi2" style={{ flex: 1 }}
              placeholder="Add alias…"
              value={aliasInput}
              onChange={e => setAliasInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddAlias()}
            />
            <button className="btn btn-p btn-sm" onClick={handleAddAlias}>+</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend
npm run build 2>&1 | tail -5
```

Expected: Build completes cleanly.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Catalog/CatalogPage.jsx
git commit -m "feat: CatalogPage — filterable table + detail drawer + alias management"
```

---

## Task 11: OnboardingPage 7-step wizard

**Files:**
- Modify: `frontend/src/pages/Onboarding/OnboardingPage.jsx`

- [ ] **Step 1: Write the wizard page**

Replace `frontend/src/pages/Onboarding/OnboardingPage.jsx` with:

```jsx
import { useState, useEffect } from "react";
import { extractContract, fetchDrafts, createDraft, updateDraft, deleteDraft, publishOnboarding } from "../../api/onboarding";
import { fetchCatalogBrief } from "../../api/catalog";

const STEPS = [
  "Upload Contract",
  "Contract Details",
  "Line Items",
  "Canonical Mapping",
  "App Owner & Notes",
  "Aliases",
  "Review & Publish",
];

const EMPTY_LINE = { contract_name: "", metric: "", license_type: "subscription", entitled_count: "", unit_cost_inr: "", annual_cost_inr: "" };

function StepBar({ current }) {
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 24 }}>
      {STEPS.map((s, i) => (
        <div key={i} style={{ flex: 1, textAlign: "center" }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%", margin: "0 auto 4px",
            background: i < current ? "var(--green)" : i === current ? "var(--navy-mid)" : "var(--bdr)",
            color: i <= current ? "#fff" : "var(--tx-q)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700,
          }}>
            {i < current ? "✓" : i + 1}
          </div>
          <div style={{ fontSize: 10, color: i === current ? "var(--navy-mid)" : "var(--tx-q)", fontWeight: i === current ? 700 : 400 }}>
            {s}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [extractError, setExtractError] = useState("");

  // Step 2 — contract details
  const [meta, setMeta] = useState({ po_number: "", clm_id: "", reseller: "", start_date: "", end_date: "", total_value_inr: "", auto_renewal_clause: "" });

  // Step 3 — line items
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);

  // Step 4 — canonical mapping
  const [catalogBrief, setCatalogBrief] = useState([]);
  const [mappingMode, setMappingMode] = useState("new"); // "new" | "existing"
  const [canonicalName, setCanonicalName] = useState("");
  const [selectedSwId, setSelectedSwId] = useState("");
  const [gxpFlag, setGxpFlag] = useState("no");
  const [vendorRisk, setVendorRisk] = useState("LOW");
  const [deployment, setDeployment] = useState("cloud");

  // Step 5 — app owner
  const [appOwnerNotes, setAppOwnerNotes] = useState("");

  // Step 6 — aliases
  const [aliases, setAliases] = useState([]);
  const [aliasInput, setAliasInput] = useState("");

  // Drafts
  const [drafts, setDrafts] = useState([]);
  const [draftId, setDraftId] = useState(null);

  // Publish
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(null);

  useEffect(() => {
    fetchDrafts().then(setDrafts).catch(() => {});
    fetchCatalogBrief().then(setCatalogBrief).catch(() => {});
  }, []);

  // Pre-fill step 2 from extracted data
  useEffect(() => {
    if (extracted) {
      setMeta({
        po_number: extracted.po_number || "",
        clm_id: extracted.clm_id || "",
        reseller: extracted.reseller || "",
        start_date: extracted.start_date || "",
        end_date: extracted.end_date || "",
        total_value_inr: extracted.total_value_inr ?? "",
        auto_renewal_clause: extracted.auto_renewal_clause || "",
      });
      if (extracted.line_items?.length) {
        setLines(extracted.line_items.map(li => ({
          contract_name: li.contract_name || "",
          metric: li.metric || "",
          license_type: li.license_type || "subscription",
          entitled_count: li.entitled_count ?? "",
          unit_cost_inr: li.unit_cost_inr ?? "",
          annual_cost_inr: li.annual_cost_inr ?? "",
        })));
      }
    }
  }, [extracted]);

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true);
    setExtractError("");
    try {
      const result = await extractContract(file);
      setExtracted(result);
      setStep(1);
    } catch (e) {
      setExtractError(e?.response?.data?.detail || "Extraction failed. Check the file and try again.");
    } finally {
      setExtracting(false);
    }
  };

  const handleSkipExtract = () => { setStep(1); };

  const saveDraft = async () => {
    const data = {
      po_number: meta.po_number || undefined,
      form_data_json: { step, meta, lines, canonicalName, selectedSwId, mappingMode, gxpFlag, vendorRisk, deployment, appOwnerNotes, aliases },
      current_step: step + 1,
    };
    try {
      if (draftId) {
        await updateDraft(draftId, data);
      } else {
        const d = await createDraft(data);
        setDraftId(d.id);
      }
      fetchDrafts().then(setDrafts);
    } catch (e) {
      console.error("Draft save failed", e);
    }
  };

  const loadDraft = (draft) => {
    if (!draft.form_data_json) return;
    const d = draft.form_data_json;
    setStep(d.step || 0);
    setMeta(d.meta || {});
    setLines(d.lines || [{ ...EMPTY_LINE }]);
    setCanonicalName(d.canonicalName || "");
    setSelectedSwId(d.selectedSwId || "");
    setMappingMode(d.mappingMode || "new");
    setGxpFlag(d.gxpFlag || "no");
    setVendorRisk(d.vendorRisk || "LOW");
    setDeployment(d.deployment || "cloud");
    setAppOwnerNotes(d.appOwnerNotes || "");
    setAliases(d.aliases || []);
    setDraftId(draft.id);
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const payload = {
        ...meta,
        total_value_inr: meta.total_value_inr ? parseInt(meta.total_value_inr) : undefined,
        canonical_name: mappingMode === "existing" ? (catalogBrief.find(s => s.sw_id === selectedSwId)?.canonical_name || canonicalName) : canonicalName,
        sw_id: mappingMode === "existing" ? selectedSwId : undefined,
        gxp_flag: gxpFlag,
        vendor_risk: vendorRisk,
        deployment,
        notes: appOwnerNotes || undefined,
        line_items: lines.map(l => ({
          ...l,
          entitled_count: l.entitled_count ? parseInt(l.entitled_count) : undefined,
          unit_cost_inr: l.unit_cost_inr ? parseInt(l.unit_cost_inr) : undefined,
          annual_cost_inr: l.annual_cost_inr ? parseInt(l.annual_cost_inr) : undefined,
        })),
        aliases,
      };
      const result = await publishOnboarding(payload);
      setPublished(result);
      if (draftId) { await deleteDraft(draftId); setDraftId(null); }
    } catch (e) {
      alert(e?.response?.data?.detail || "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  if (published) {
    return (
      <div className="page">
        <div className="ph">
          <div className="bc">SAM Platform <span>›</span> Onboard Software</div>
          <h1>Onboarding Complete</h1>
        </div>
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 24, maxWidth: 480 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Software registered successfully</div>
          <div style={{ fontSize: 13, color: "var(--tx-m)", marginBottom: 12 }}>
            <strong>SW_ID:</strong> {published.sw_id} · <strong>Contract:</strong> {published.contract_id}<br />
            <strong>Entitlements:</strong> {published.ent_ids.join(", ")}
          </div>
          <button className="btn btn-p btn-sm" onClick={() => { setPublished(null); setStep(0); setFile(null); setExtracted(null); setMeta({}); setLines([{ ...EMPTY_LINE }]); setCanonicalName(""); setSelectedSwId(""); setAliases([]); setAppOwnerNotes(""); }}>
            Onboard Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> Onboard Software</div>
        <h1>Onboard New Software / License</h1>
        <p>7-step wizard with AI contract extraction</p>
      </div>

      {drafts.length > 0 && !draftId && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Resume a saved draft</div>
          {drafts.map(d => (
            <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--bdr)" }}>
              <span style={{ fontSize: 12 }}>{d.po_number || "Draft"} — step {d.current_step}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-p btn-sm" onClick={() => loadDraft(d)}>Resume</button>
                <button className="btn btn-d btn-sm" onClick={async () => { await deleteDraft(d.id); fetchDrafts().then(setDrafts); }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <StepBar current={step} />

      <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 20, maxWidth: 720 }}>

        {/* Step 0 — Upload */}
        {step === 0 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Step 1 — Upload Contract File</div>
            <div className="fg">
              <label className="fl">Contract PDF or DOCX</label>
              <input type="file" accept=".pdf,.docx,.doc" className="fi2"
                onChange={e => setFile(e.target.files?.[0] || null)} />
              <div className="fhint">Max 25 MB · AI will extract vendor, PO, dates, and line items</div>
            </div>
            {extractError && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 6 }}>{extractError}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn btn-p btn-sm" onClick={handleExtract} disabled={!file || extracting}>
                {extracting ? "Extracting…" : "Extract with AI →"}
              </button>
              <button className="btn btn-o btn-sm" onClick={handleSkipExtract}>Skip — Enter Manually</button>
            </div>
          </div>
        )}

        {/* Step 1 — Contract Metadata */}
        {step === 1 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Step 2 — Contract Details</div>
            {extracted && <div style={{ background: "var(--navy-xlt)", borderRadius: 6, padding: "6px 10px", fontSize: 11, marginBottom: 12, color: "var(--navy-mid)" }}>AI-extracted data pre-filled below. Review and edit as needed.</div>}
            <div className="fr3">
              <div className="fg">
                <label className="fl">PO Number</label>
                <input className="fi2" value={meta.po_number} onChange={e => setMeta(m => ({ ...m, po_number: e.target.value }))} placeholder="PO-2024-001" />
              </div>
              <div className="fg">
                <label className="fl">CLM ID</label>
                <input className="fi2" value={meta.clm_id} onChange={e => setMeta(m => ({ ...m, clm_id: e.target.value }))} placeholder="CLM-12345" />
              </div>
              <div className="fg">
                <label className="fl">Reseller</label>
                <input className="fi2" value={meta.reseller} onChange={e => setMeta(m => ({ ...m, reseller: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div className="fr3">
              <div className="fg">
                <label className="fl">Start Date</label>
                <input className="fi2" type="date" value={meta.start_date} onChange={e => setMeta(m => ({ ...m, start_date: e.target.value }))} />
              </div>
              <div className="fg">
                <label className="fl">End Date</label>
                <input className="fi2" type="date" value={meta.end_date} onChange={e => setMeta(m => ({ ...m, end_date: e.target.value }))} />
              </div>
              <div className="fg">
                <label className="fl">Auto-Renewal</label>
                <select className="fi2" value={meta.auto_renewal_clause} onChange={e => setMeta(m => ({ ...m, auto_renewal_clause: e.target.value }))}>
                  <option value="">Unknown</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                  <option value="opt_in">Opt-In</option>
                </select>
              </div>
            </div>
            <div className="fg" style={{ marginTop: 4 }}>
              <label className="fl">Total Value (INR)</label>
              <input className="fi2" type="number" value={meta.total_value_inr} onChange={e => setMeta(m => ({ ...m, total_value_inr: e.target.value }))} placeholder="e.g. 5000000" style={{ maxWidth: 200 }} />
            </div>
          </div>
        )}

        {/* Step 2 — Line Items */}
        {step === 2 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Step 3 — License Line Items</div>
            {lines.map((line, idx) => (
              <div key={idx} style={{ background: "var(--bg2)", borderRadius: 6, padding: 10, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Line Item {idx + 1}</span>
                  {lines.length > 1 && (
                    <button className="btn btn-d btn-sm" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}>Remove</button>
                  )}
                </div>
                <div className="fr3">
                  <div className="fg">
                    <label className="fl">Contract Name <span className="req">*</span></label>
                    <input className="fi2" value={line.contract_name} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, contract_name: e.target.value } : l))} placeholder="e.g. Microsoft 365 E3" />
                  </div>
                  <div className="fg">
                    <label className="fl">License Type</label>
                    <select className="fi2" value={line.license_type} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, license_type: e.target.value } : l))}>
                      <option value="subscription">Subscription</option>
                      <option value="perpetual">Perpetual</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">Metric</label>
                    <input className="fi2" value={line.metric} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, metric: e.target.value } : l))} placeholder="e.g. Per User" />
                  </div>
                </div>
                <div className="fr3">
                  <div className="fg">
                    <label className="fl">Entitled Count</label>
                    <input className="fi2" type="number" value={line.entitled_count} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, entitled_count: e.target.value } : l))} />
                  </div>
                  <div className="fg">
                    <label className="fl">Unit Cost (INR)</label>
                    <input className="fi2" type="number" value={line.unit_cost_inr} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, unit_cost_inr: e.target.value } : l))} />
                  </div>
                  <div className="fg">
                    <label className="fl">Annual Cost (INR)</label>
                    <input className="fi2" type="number" value={line.annual_cost_inr} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, annual_cost_inr: e.target.value } : l))} />
                  </div>
                </div>
              </div>
            ))}
            <button className="btn btn-o btn-sm" onClick={() => setLines(ls => [...ls, { ...EMPTY_LINE }])}>+ Add Line Item</button>
          </div>
        )}

        {/* Step 3 — Canonical Mapping */}
        {step === 3 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Step 4 — Canonical Name Mapping</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <button className={`btn btn-sm ${mappingMode === "new" ? "btn-p" : "btn-o"}`} onClick={() => setMappingMode("new")}>Create New SW Entry</button>
              <button className={`btn btn-sm ${mappingMode === "existing" ? "btn-p" : "btn-o"}`} onClick={() => setMappingMode("existing")}>Map to Existing SW</button>
            </div>
            {mappingMode === "new" ? (
              <div>
                <div className="fg">
                  <label className="fl">Canonical Name <span className="req">*</span></label>
                  <input className="fi2" value={canonicalName} onChange={e => setCanonicalName(e.target.value)} placeholder="e.g. Microsoft 365" />
                  <div className="fhint">This becomes the authoritative name across the SAM platform.</div>
                </div>
                <div className="fr3" style={{ marginTop: 8 }}>
                  <div className="fg">
                    <label className="fl">GxP Flag</label>
                    <select className="fi2" value={gxpFlag} onChange={e => setGxpFlag(e.target.value)}>
                      <option value="no">Non-GxP</option>
                      <option value="yes_21cfr">21 CFR Part 11</option>
                      <option value="yes_annex11">Annex 11</option>
                      <option value="yes_both">Both</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">Vendor Risk</label>
                    <select className="fi2" value={vendorRisk} onChange={e => setVendorRisk(e.target.value)}>
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">Deployment</label>
                    <select className="fi2" value={deployment} onChange={e => setDeployment(e.target.value)}>
                      <option value="cloud">Cloud</option>
                      <option value="on_premise">On-Premise</option>
                      <option value="desktop_cloud">Desktop / Cloud</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div className="fg">
                <label className="fl">Select Existing SW Entry <span className="req">*</span></label>
                <select className="fi2" value={selectedSwId} onChange={e => setSelectedSwId(e.target.value)}>
                  <option value="">Select…</option>
                  {catalogBrief.map(sw => (
                    <option key={sw.sw_id} value={sw.sw_id}>{sw.sw_id} — {sw.canonical_name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Step 4 — App Owner & Notes */}
        {step === 4 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Step 5 — App Owner &amp; Notes</div>
            <div className="fg">
              <label className="fl">Notes / Additional Context</label>
              <textarea className="fi2" rows={4} value={appOwnerNotes} onChange={e => setAppOwnerNotes(e.target.value)} placeholder="Any additional context about this software or contract…" style={{ resize: "vertical" }} />
            </div>
          </div>
        )}

        {/* Step 5 — Aliases */}
        {step === 5 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Step 6 — Aliases</div>
            <div className="fhint" style={{ marginBottom: 10 }}>Add all known names this software is referred to as (e.g., from SCCM, discovery sources, purchase orders).</div>
            {aliases.map((a, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--bdr)", fontSize: 13 }}>
                <span>{a}</span>
                <button style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }}
                  onClick={() => setAliases(as => as.filter((_, idx) => idx !== i))}>✕</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <input className="fi2" style={{ flex: 1 }} placeholder="e.g. MS365 · Office 365 · MSFT 365"
                value={aliasInput} onChange={e => setAliasInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && aliasInput.trim()) { setAliases(as => [...as, aliasInput.trim()]); setAliasInput(""); } }} />
              <button className="btn btn-p btn-sm" onClick={() => { if (aliasInput.trim()) { setAliases(as => [...as, aliasInput.trim()]); setAliasInput(""); } }}>+ Add</button>
            </div>
          </div>
        )}

        {/* Step 6 — Review & Publish */}
        {step === 6 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Step 7 — Review &amp; Publish</div>
            <div style={{ fontSize: 12, lineHeight: 1.8 }}>
              <div><strong>Canonical Name:</strong> {mappingMode === "existing" ? (catalogBrief.find(s => s.sw_id === selectedSwId)?.canonical_name || "—") : canonicalName || "—"}</div>
              {mappingMode === "existing" && <div><strong>Mapping to SW_ID:</strong> {selectedSwId}</div>}
              <div><strong>PO Number:</strong> {meta.po_number || "—"}</div>
              <div><strong>Contract Period:</strong> {meta.start_date || "—"} → {meta.end_date || "—"}</div>
              <div><strong>Total Value (INR):</strong> {meta.total_value_inr ? `₹${Number(meta.total_value_inr).toLocaleString("en-IN")}` : "—"}</div>
              <div><strong>Line Items:</strong> {lines.length} ({lines.map(l => l.contract_name).filter(Boolean).join(", ") || "—"})</div>
              <div><strong>Aliases:</strong> {aliases.length > 0 ? aliases.join(", ") : "None"}</div>
              <div><strong>GxP:</strong> {gxpFlag} · <strong>Vendor Risk:</strong> {vendorRisk} · <strong>Deployment:</strong> {deployment}</div>
            </div>
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-p" onClick={handlePublish} disabled={publishing}>
                {publishing ? "Publishing…" : "Publish & Create Records"}
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--bdr)" }}>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && <button className="btn btn-o btn-sm" onClick={() => setStep(s => s - 1)}>← Back</button>}
            <button className="btn btn-o btn-sm" onClick={saveDraft}>Save Draft</button>
          </div>
          {step < 6 && (
            <button className="btn btn-p btn-sm" onClick={() => setStep(s => s + 1)}>
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend
npm run build 2>&1 | tail -5
```

Expected: Build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Onboarding/OnboardingPage.jsx
git commit -m "feat: OnboardingPage — 7-step wizard with AI extraction, draft save/resume, publish"
```

---

## Task 12: Final verification + commit

**Files:**
- No new files

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend
pytest -v
```

Expected: All tests pass.

- [ ] **Step 2: Verify frontend build is clean**

```bash
cd frontend
npm run build 2>&1 | grep -E "error|warning|built in"
```

Expected: No errors. Output ends with `built in Xs`.

- [ ] **Step 3: Verify backend API routes count**

```bash
cd backend
python -c "
from app.main import app
routes = [r.path for r in app.routes]
print(f'{len(routes)} routes registered')
for r in sorted(routes): print(' ', r)
"
```

Expected: 35+ routes, including `/api/v1/catalog`, `/api/v1/catalog/brief`, `/api/v1/onboarding/extract`, `/api/v1/onboarding/drafts`, `/api/v1/onboarding/publish`.

- [ ] **Step 4: Final commit**

```bash
git add -A
git status
git commit -m "feat: sub-project 3 complete — Software Catalog + 7-step Onboarding Wizard with AI extraction"
```

---

## Self-Review Notes

**Spec coverage:**
- ✅ SW_ID sequential generation (SW-001…SW-NNN)
- ✅ Catalog CRUD: canonical name, publisher, category, GxP flag, vendor risk, deployment, region, app owner, notes, onboarded date, aliases
- ✅ 7-step wizard: upload → metadata → line items → canonical mapping → app owner → aliases → review/publish
- ✅ GPT-4o extraction with JSON mode, PDF + DOCX support
- ✅ Multi-line-item support
- ✅ Contract Name → Canonical Name → SW_ID mapping (new or existing)
- ✅ Alias management (add/remove both in catalog UI and during onboarding)
- ✅ Draft save/resume
- ✅ Step 7 Review & Publish creates Contract + SoftwareCatalog + Entitlement records
- ✅ ENT_ID sequential generation
- ✅ 12 seed catalog entries

**Type consistency check:**
- `_next_sw_id` defined identically in both catalog.py and onboarding.py ✅
- `_next_ent_id` defined in onboarding.py only (only place ENT IDs are created) ✅
- `PublishOut.contract_id` is `UUID` — `Contract.id` is `UUID(as_uuid=True)` ✅
- `LineItemIn` field names match `Entitlement` model column names ✅
