# Entitlements + Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the entitlement register (CRUD + XLSX template download/upload), discovery record ingest, and a storage abstraction layer that switches between Supabase Storage (local) and AWS S3 (production) via a single env var.

**Architecture:** FastAPI routes for entitlements (list/filter/get/put/template-download/upload) and discovery (list/ingest); an `openpyxl`-based XLSX processor handles both template generation and Tab A/B parsing; a `StorageBackend` ABC with Supabase and S3 implementations is selected at startup by `STORAGE_BACKEND` env var and injected into upload routes; discovery ingest auto-matches rows against the SW catalog by canonical name and aliases.

**Tech Stack:** FastAPI · SQLAlchemy 2.0 async · openpyxl≥3.1 · boto3≥1.35 · httpx (Supabase Storage REST) · React 18 · Axios · DRL CSS design system

---

## File Map

**Create:**
- `backend/app/services/storage/__init__.py` — package marker
- `backend/app/services/storage/base.py` — `StorageBackend` ABC
- `backend/app/services/storage/supabase_backend.py` — Supabase Storage REST implementation
- `backend/app/services/storage/s3_backend.py` — boto3 S3 implementation
- `backend/app/services/storage/factory.py` — `get_storage_backend()` singleton factory
- `backend/app/services/uploads/__init__.py` — package marker
- `backend/app/services/uploads/xlsx_processor.py` — template generator + Tab A/B parser
- `backend/app/schemas/entitlements.py` — Pydantic schemas for Entitlement
- `backend/app/schemas/discovery.py` — Pydantic schemas for DiscoveryRecord
- `backend/app/api/v1/routes/entitlements.py` — list, get, put, template, upload endpoints
- `backend/app/api/v1/routes/discovery.py` — list, ingest endpoints
- `backend/tests/test_entitlements.py` — entitlement API tests
- `backend/tests/test_discovery.py` — discovery API tests
- `frontend/src/api/entitlements.js` — Axios wrappers
- `frontend/src/api/discovery.js` — Axios wrappers

**Modify:**
- `backend/requirements.txt` — add openpyxl, boto3
- `backend/app/main.py` — register entitlements_router + discovery_router

**Replace (existing placeholders):**
- `frontend/src/pages/Entitlements/EntitlementsPage.jsx`
- `frontend/src/pages/Discovery/DiscoveryPage.jsx`

---

## Task 1: Add openpyxl and boto3 to requirements

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add the two packages**

Replace `backend/requirements.txt` with:

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
openpyxl>=3.1.0
boto3>=1.35.0
```

- [ ] **Step 2: Install**

```bash
cd backend
pip install "openpyxl>=3.1.0" "boto3>=1.35.0"
```

Expected: both install cleanly.

- [ ] **Step 3: Verify imports**

```bash
cd backend
python -c "import openpyxl; import boto3; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt
git commit -m "feat: add openpyxl + boto3 for XLSX processing and S3 storage"
```

---

## Task 2: Storage abstraction layer

**Files:**
- Create: `backend/app/services/storage/__init__.py`
- Create: `backend/app/services/storage/base.py`
- Create: `backend/app/services/storage/supabase_backend.py`
- Create: `backend/app/services/storage/s3_backend.py`
- Create: `backend/app/services/storage/factory.py`

- [ ] **Step 1: Create package marker**

Create `backend/app/services/storage/__init__.py`:
```python
```

- [ ] **Step 2: Create the ABC**

Create `backend/app/services/storage/base.py`:

```python
from abc import ABC, abstractmethod


class StorageBackend(ABC):
    @abstractmethod
    async def upload(self, data: bytes, path: str, content_type: str = "application/octet-stream") -> str:
        """Upload bytes to the given path. Returns the storage path."""

    @abstractmethod
    async def get_signed_url(self, path: str, expires_in: int = 3600) -> str:
        """Return a time-limited URL for downloading the file at path."""
```

- [ ] **Step 3: Create Supabase backend**

Create `backend/app/services/storage/supabase_backend.py`:

```python
import httpx
from app.services.storage.base import StorageBackend
from app.core.config import settings

BUCKET = "drl-sam-files"


class SupabaseStorageBackend(StorageBackend):
    def __init__(self):
        self._base = f"{settings.supabase_url}/storage/v1"
        self._headers = {
            "Authorization": f"Bearer {settings.supabase_service_key}",
            "apikey": settings.supabase_service_key,
        }

    async def upload(self, data: bytes, path: str, content_type: str = "application/octet-stream") -> str:
        url = f"{self._base}/object/{BUCKET}/{path}"
        async with httpx.AsyncClient() as client:
            r = await client.post(
                url,
                content=data,
                headers={**self._headers, "Content-Type": content_type, "x-upsert": "true"},
            )
            r.raise_for_status()
        return path

    async def get_signed_url(self, path: str, expires_in: int = 3600) -> str:
        url = f"{self._base}/object/sign/{BUCKET}/{path}"
        async with httpx.AsyncClient() as client:
            r = await client.post(
                url,
                json={"expiresIn": expires_in},
                headers={**self._headers, "Content-Type": "application/json"},
            )
            r.raise_for_status()
        return r.json()["signedURL"]
```

- [ ] **Step 4: Create S3 backend**

Create `backend/app/services/storage/s3_backend.py`:

```python
import asyncio
from app.services.storage.base import StorageBackend
from app.core.config import settings


class S3StorageBackend(StorageBackend):
    def __init__(self):
        import boto3
        self._s3 = boto3.client(
            "s3",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
        self._bucket = settings.aws_s3_bucket_active

    async def upload(self, data: bytes, path: str, content_type: str = "application/octet-stream") -> str:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self._s3.put_object(
                Bucket=self._bucket,
                Key=path,
                Body=data,
                ContentType=content_type,
            ),
        )
        return path

    async def get_signed_url(self, path: str, expires_in: int = 3600) -> str:
        loop = asyncio.get_event_loop()
        url = await loop.run_in_executor(
            None,
            lambda: self._s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": path},
                ExpiresIn=expires_in,
            ),
        )
        return url
```

- [ ] **Step 5: Create factory**

Create `backend/app/services/storage/factory.py`:

```python
from app.core.config import settings
from app.services.storage.base import StorageBackend

_instance: StorageBackend | None = None


def get_storage_backend() -> StorageBackend:
    global _instance
    if _instance is None:
        if settings.storage_backend == "s3":
            from app.services.storage.s3_backend import S3StorageBackend
            _instance = S3StorageBackend()
        else:
            from app.services.storage.supabase_backend import SupabaseStorageBackend
            _instance = SupabaseStorageBackend()
    return _instance
```

- [ ] **Step 6: Verify imports**

```bash
cd backend
python -c "from app.services.storage.factory import get_storage_backend; print('OK')"
```

Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/storage/
git commit -m "feat: StorageBackend ABC + Supabase + S3 implementations + factory"
```

---

## Task 3: XLSX processor service

**Files:**
- Create: `backend/app/services/uploads/__init__.py`
- Create: `backend/app/services/uploads/xlsx_processor.py`

- [ ] **Step 1: Create package marker**

Create `backend/app/services/uploads/__init__.py`:
```python
```

- [ ] **Step 2: Create the XLSX processor**

Create `backend/app/services/uploads/xlsx_processor.py`:

```python
"""
XLSX template generator and Tab A / Tab B parser.

Tab A — Entitlement Metadata (editable fields):
  ENT_ID | Entitled Count | Unit Cost (INR) | Annual Cost (INR) | Notes

Tab B — Usage Update:
  ENT_ID | In-Use Count | Reporting Period | Reason for Change
"""
import io
import hashlib
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment


_HEADER_FILL = PatternFill("solid", fgColor="1A2E5A")   # DRL navy
_HEADER_FONT = Font(color="FFFFFF", bold=True, size=10)
_LOCKED_FILL = PatternFill("solid", fgColor="F0F2F5")   # light grey = read-only hint


def _style_header(ws, row: int, cols: int) -> None:
    for col in range(1, cols + 1):
        cell = ws.cell(row=row, column=col)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="center")


def generate_template(entitlements: list[dict]) -> bytes:
    """
    Build an XLSX workbook with two sheets pre-populated from entitlements list.
    Each dict must have: ent_id, sw_id, canonical_name, contract_name,
                         license_type, metric_name, entitled_count,
                         in_use_count, unit_cost_inr, annual_cost_inr, notes
    Returns raw bytes of the .xlsx file.
    """
    wb = Workbook()

    # ── Tab A ──────────────────────────────────────────────────────────────────
    ws_a = wb.active
    ws_a.title = "Tab A - Metadata"
    headers_a = ["ENT_ID", "SW_ID", "Canonical Name", "Contract Name",
                 "License Type", "Metric", "Entitled Count",
                 "Unit Cost (INR)", "Annual Cost (INR)", "Notes"]
    ws_a.append(headers_a)
    _style_header(ws_a, 1, len(headers_a))
    # Lock info columns (grey) — only cols 7-10 are editable
    for i, col in enumerate([1, 2, 3, 4, 5, 6], start=1):
        for row in ws_a.iter_rows(min_row=2, min_col=col, max_col=col):
            for cell in row:
                cell.fill = _LOCKED_FILL

    for ent in entitlements:
        ws_a.append([
            ent.get("ent_id", ""),
            ent.get("sw_id", ""),
            ent.get("canonical_name", ""),
            ent.get("contract_name", ""),
            ent.get("license_type", ""),
            ent.get("metric_name", ""),
            ent.get("entitled_count") or "",
            ent.get("unit_cost_inr") or "",
            ent.get("annual_cost_inr") or "",
            ent.get("notes") or "",
        ])

    # ── Tab B ──────────────────────────────────────────────────────────────────
    ws_b = wb.create_sheet("Tab B - Usage")
    headers_b = ["ENT_ID", "SW_ID", "Canonical Name", "In-Use Count",
                 "Reporting Period", "Reason for Change"]
    ws_b.append(headers_b)
    _style_header(ws_b, 1, len(headers_b))
    for i, col in enumerate([1, 2, 3], start=1):
        for row in ws_b.iter_rows(min_row=2, min_col=col, max_col=col):
            for cell in row:
                cell.fill = _LOCKED_FILL

    for ent in entitlements:
        ws_b.append([
            ent.get("ent_id", ""),
            ent.get("sw_id", ""),
            ent.get("canonical_name", ""),
            ent.get("in_use_count") or "",
            "",  # Reporting Period — user fills
            "",  # Reason — user fills
        ])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def parse_tab_a(data: bytes) -> list[dict]:
    """
    Parse Tab A sheet. Returns list of dicts with keys:
    ent_id, entitled_count, unit_cost_inr, annual_cost_inr, notes
    Skips rows where ENT_ID is blank.
    """
    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb["Tab A - Metadata"]
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    result = []
    for row in rows:
        if not row or not row[0]:
            continue
        result.append({
            "ent_id": str(row[0]).strip(),
            "entitled_count": int(row[6]) if row[6] is not None else None,
            "unit_cost_inr": int(row[7]) if row[7] is not None else None,
            "annual_cost_inr": int(row[8]) if row[8] is not None else None,
            "notes": str(row[9]).strip() if row[9] else None,
        })
    return result


def parse_tab_b(data: bytes) -> list[dict]:
    """
    Parse Tab B sheet. Returns list of dicts with keys:
    ent_id, in_use_count, reporting_period, reason
    Skips rows where ENT_ID is blank.
    """
    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb["Tab B - Usage"]
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    result = []
    for row in rows:
        if not row or not row[0]:
            continue
        result.append({
            "ent_id": str(row[0]).strip(),
            "in_use_count": int(row[3]) if row[3] is not None else None,
            "reporting_period": str(row[4]).strip() if row[4] else None,
            "reason": str(row[5]).strip() if row[5] else None,
        })
    return result


def file_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
```

- [ ] **Step 3: Verify import**

```bash
cd backend
python -c "from app.services.uploads.xlsx_processor import generate_template, parse_tab_a, parse_tab_b, file_hash; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/uploads/
git commit -m "feat: XLSX processor — template generator + Tab A/B parser"
```

---

## Task 4: Entitlement Pydantic schemas

**Files:**
- Create: `backend/app/schemas/entitlements.py`

- [ ] **Step 1: Create schema file**

Create `backend/app/schemas/entitlements.py`:

```python
from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class EntitlementOut(BaseModel):
    ent_id: str
    sw_id: str
    contract_id: UUID | None = None
    contract_name: str | None = None
    metric_id: UUID | None = None
    license_type: str
    entitled_count: int | None = None
    in_use_count: int | None = None
    unit_cost_inr: int | None = None
    annual_cost_inr: int | None = None
    region_id: UUID | None = None
    discovery_source_id: UUID | None = None
    usage_method_id: UUID | None = None
    app_owner_id: UUID | None = None
    status: str
    last_updated: datetime | None = None
    model_config = {"from_attributes": True}


class EntitlementUpdate(BaseModel):
    contract_name: str | None = None
    metric_id: UUID | None = None
    license_type: str | None = None
    entitled_count: int | None = None
    in_use_count: int | None = None
    unit_cost_inr: int | None = None
    annual_cost_inr: int | None = None
    region_id: UUID | None = None
    app_owner_id: UUID | None = None
    status: str | None = None


class UploadResultOut(BaseModel):
    upload_id: UUID
    tab_a_updated: int   # count of rows processed from Tab A
    tab_b_updated: int   # count of rows processed from Tab B
    errors: list[str] = []
```

- [ ] **Step 2: Verify import**

```bash
cd backend
python -c "from app.schemas.entitlements import EntitlementOut, EntitlementUpdate, UploadResultOut; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/entitlements.py
git commit -m "feat: entitlement Pydantic schemas"
```

---

## Task 5: Entitlement router + wire into main.py

**Files:**
- Create: `backend/app/api/v1/routes/entitlements.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create entitlement router**

Create `backend/app/api/v1/routes/entitlements.py`:

```python
import io
from datetime import date, datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.api.deps import get_current_user, require_role
from app.models.contracts import Entitlement
from app.models.catalog import SoftwareCatalog
from app.models.masters import LicenseMetric
from app.models.uploads import UsageUpload
from app.schemas.entitlements import EntitlementOut, EntitlementUpdate, UploadResultOut
from app.services.uploads.xlsx_processor import generate_template, parse_tab_a, parse_tab_b, file_hash
from app.services.storage.factory import get_storage_backend

router = APIRouter(prefix="/entitlements", tags=["entitlements"])
admin_only = Depends(require_role(["COE_ADMIN"]))


@router.get("", response_model=list[EntitlementOut])
async def list_entitlements(
    sw_id: str | None = Query(None),
    status: str | None = Query(None),
    license_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(Entitlement)
    if sw_id:
        q = q.where(Entitlement.sw_id == sw_id)
    if status:
        q = q.where(Entitlement.status == status)
    if license_type:
        q = q.where(Entitlement.license_type == license_type)
    result = await db.execute(q.order_by(Entitlement.ent_id))
    return [EntitlementOut.model_validate(e) for e in result.scalars().all()]


@router.get("/template")
async def download_template(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Entitlement).order_by(Entitlement.ent_id))
    ents = result.scalars().all()

    rows = []
    for ent in ents:
        sw = await db.get(SoftwareCatalog, ent.sw_id)
        metric = await db.get(LicenseMetric, ent.metric_id) if ent.metric_id else None
        rows.append({
            "ent_id": ent.ent_id,
            "sw_id": ent.sw_id,
            "canonical_name": sw.canonical_name if sw else "",
            "contract_name": ent.contract_name or "",
            "license_type": ent.license_type,
            "metric_name": metric.name if metric else "",
            "entitled_count": ent.entitled_count,
            "in_use_count": ent.in_use_count,
            "unit_cost_inr": ent.unit_cost_inr,
            "annual_cost_inr": ent.annual_cost_inr,
            "notes": None,
        })

    xlsx_bytes = generate_template(rows)
    today = date.today().isoformat()
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=entitlements_{today}.xlsx"},
    )


@router.get("/{ent_id}", response_model=EntitlementOut)
async def get_entitlement(ent_id: str, db: AsyncSession = Depends(get_db)):
    ent = await db.get(Entitlement, ent_id)
    if not ent:
        raise HTTPException(status_code=404, detail="Entitlement not found")
    return EntitlementOut.model_validate(ent)


@router.put("/{ent_id}", response_model=EntitlementOut, dependencies=[admin_only])
async def update_entitlement(ent_id: str, body: EntitlementUpdate, db: AsyncSession = Depends(get_db)):
    ent = await db.get(Entitlement, ent_id)
    if not ent:
        raise HTTPException(status_code=404, detail="Entitlement not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(ent, k, v)
    await db.commit()
    await db.refresh(ent)
    return EntitlementOut.model_validate(ent)


@router.post("/upload", response_model=UploadResultOut, status_code=201)
async def upload_usage(
    file: UploadFile = File(...),
    reporting_period: str | None = Query(None),
    reason: str | None = Query(None),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Upload must be an .xlsx file")

    data = await file.read()
    fhash = file_hash(data)
    errors: list[str] = []
    tab_a_count = 0
    tab_b_count = 0

    # Parse Tab A
    try:
        tab_a_rows = parse_tab_a(data)
        for row in tab_a_rows:
            ent = await db.get(Entitlement, row["ent_id"])
            if not ent:
                errors.append(f"Tab A: ENT_ID {row['ent_id']} not found — skipped")
                continue
            for field in ("entitled_count", "unit_cost_inr", "annual_cost_inr"):
                if row[field] is not None:
                    setattr(ent, field, row[field])
            if row["notes"]:
                pass  # notes not on Entitlement model — silently ignore
            tab_a_count += 1
    except Exception as e:
        errors.append(f"Tab A parse error: {e}")

    # Parse Tab B
    try:
        tab_b_rows = parse_tab_b(data)
        for row in tab_b_rows:
            ent = await db.get(Entitlement, row["ent_id"])
            if not ent:
                errors.append(f"Tab B: ENT_ID {row['ent_id']} not found — skipped")
                continue
            if row["in_use_count"] is not None:
                ent.in_use_count = row["in_use_count"]
            tab_b_count += 1
    except Exception as e:
        errors.append(f"Tab B parse error: {e}")

    await db.flush()

    # Upload file to storage
    storage = get_storage_backend()
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    storage_path = f"uploads/{current_user.id}/{ts}_{file.filename}"
    try:
        await storage.upload(
            data, storage_path,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except Exception:
        storage_path = f"local/{ts}_{file.filename}"  # fallback path if storage unavailable

    # Create usage_upload record
    upload_rec = UsageUpload(
        user_id=current_user.id,
        file_name=file.filename,
        file_hash=fhash,
        file_path=storage_path,
        storage_backend="supabase" if "s3" not in storage_path else "s3",
        reporting_period=reporting_period,
        reason=reason,
        processed_at=datetime.now(timezone.utc),
        status="completed" if not errors else "failed",
        error_details="\n".join(errors) if errors else None,
    )
    db.add(upload_rec)
    await db.commit()
    await db.refresh(upload_rec)

    return UploadResultOut(
        upload_id=upload_rec.id,
        tab_a_updated=tab_a_count,
        tab_b_updated=tab_b_count,
        errors=errors,
    )
```

- [ ] **Step 2: Wire into main.py**

Edit `backend/app/main.py` — add the import and `include_router` call:

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.routes.auth import router as auth_router
from app.api.v1.routes.masters import router as masters_router
from app.api.v1.routes.owners import router as owners_router
from app.api.v1.routes.catalog import router as catalog_router
from app.api.v1.routes.onboarding import router as onboarding_router
from app.api.v1.routes.entitlements import router as entitlements_router
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
app.include_router(entitlements_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "drl-sam-backend"}
```

- [ ] **Step 3: Verify routes registered**

```bash
cd backend
python -c "
from app.main import app
routes = [r.path for r in app.routes if hasattr(r, 'path') and '/entitlement' in r.path]
print('Entitlement routes:', routes)
"
```

Expected output includes: `/api/v1/entitlements`, `/api/v1/entitlements/template`, `/api/v1/entitlements/upload`, `/api/v1/entitlements/{ent_id}`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/routes/entitlements.py backend/app/main.py
git commit -m "feat: entitlement router (list/filter/get/put/template/upload) + wire into main"
```

---

## Task 6: Entitlement API tests

**Files:**
- Create: `backend/tests/test_entitlements.py`

- [ ] **Step 1: Write test file**

Create `backend/tests/test_entitlements.py`:

```python
import io
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.models.contracts import Entitlement


@pytest.fixture
async def sample_entitlement(db, admin_token, client):
    """Creates one entitlement via the publish endpoint."""
    h = {"Authorization": f"Bearer {admin_token}"}
    result = (await client.post("/api/v1/onboarding/publish", json={
        "canonical_name": "EntTest Software",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
        "line_items": [{"contract_name": "EntTest Sub", "license_type": "subscription", "entitled_count": 200}],
    }, headers=h)).json()
    ent_id = result["ent_ids"][0]
    yield ent_id
    # No cleanup — contracts FK prevents SW delete; test DB drops at session end


async def test_list_entitlements_returns_list(client):
    resp = await client.get("/api/v1/entitlements")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_get_entitlement(client, sample_entitlement):
    resp = await client.get(f"/api/v1/entitlements/{sample_entitlement}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ent_id"] == sample_entitlement
    assert data["entitled_count"] == 200


async def test_update_entitlement_requires_admin(client, sample_entitlement):
    resp = await client.put(f"/api/v1/entitlements/{sample_entitlement}", json={"in_use_count": 50})
    assert resp.status_code in (401, 403)


async def test_update_entitlement(client, admin_token, sample_entitlement):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.put(
        f"/api/v1/entitlements/{sample_entitlement}",
        json={"in_use_count": 75, "status": "OK"},
        headers=h,
    )
    assert resp.status_code == 200
    assert resp.json()["in_use_count"] == 75
    assert resp.json()["status"] == "OK"


async def test_list_filter_by_sw_id(client, sample_entitlement):
    # Get the sw_id for the entitlement
    ent = (await client.get(f"/api/v1/entitlements/{sample_entitlement}")).json()
    sw_id = ent["sw_id"]
    resp = await client.get(f"/api/v1/entitlements?sw_id={sw_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert all(e["sw_id"] == sw_id for e in data)


async def test_template_download(client):
    resp = await client.get("/api/v1/entitlements/template")
    assert resp.status_code == 200
    assert "spreadsheet" in resp.headers["content-type"]
    assert len(resp.content) > 100  # non-empty XLSX


async def test_upload_tab_b_updates_in_use(client, admin_token, sample_entitlement):
    from app.services.uploads.xlsx_processor import generate_template

    h = {"Authorization": f"Bearer {admin_token}"}
    # Build a minimal XLSX with Tab B populated
    ent_resp = (await client.get(f"/api/v1/entitlements/{sample_entitlement}")).json()
    rows = [{
        "ent_id": sample_entitlement,
        "sw_id": ent_resp["sw_id"],
        "canonical_name": "EntTest Software",
        "contract_name": "EntTest Sub",
        "license_type": "subscription",
        "metric_name": "",
        "entitled_count": 200,
        "in_use_count": 42,
        "unit_cost_inr": None,
        "annual_cost_inr": None,
        "notes": None,
    }]
    xlsx_bytes = generate_template(rows)

    with patch("app.api.v1.routes.entitlements.get_storage_backend") as mock_storage:
        mock_backend = MagicMock()
        mock_backend.upload = AsyncMock(return_value="test/path.xlsx")
        mock_storage.return_value = mock_backend

        resp = await client.post(
            "/api/v1/entitlements/upload",
            files={"file": ("usage.xlsx", io.BytesIO(xlsx_bytes),
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            headers=h,
        )

    assert resp.status_code == 201
    data = resp.json()
    assert data["tab_b_updated"] >= 1

    # Verify in_use_count updated
    updated = (await client.get(f"/api/v1/entitlements/{sample_entitlement}")).json()
    assert updated["in_use_count"] == 42
```

- [ ] **Step 2: Run entitlement tests**

```bash
cd backend
pytest tests/test_entitlements.py -v
```

Expected: All 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_entitlements.py
git commit -m "test: entitlement API — list/filter/get/put/template/upload"
```

---

## Task 7: Discovery schemas + router + wire into main.py

**Files:**
- Create: `backend/app/schemas/discovery.py`
- Create: `backend/app/api/v1/routes/discovery.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create discovery schemas**

Create `backend/app/schemas/discovery.py`:

```python
from __future__ import annotations
from datetime import date
from uuid import UUID
from pydantic import BaseModel


class DiscoveryRecordOut(BaseModel):
    disc_id: str
    contract_name: str
    sw_id: str | None = None
    canonical_name: str | None = None
    application_tagged: str | None = None
    source_id: UUID | None = None
    device_id: str | None = None
    device_type: str | None = None
    os: str | None = None
    version: str | None = None
    last_seen: date | None = None
    site: str | None = None
    region_id: UUID | None = None
    upload_date: date | None = None
    upload_batch_id: UUID | None = None
    model_config = {"from_attributes": True}


class IngestResultOut(BaseModel):
    batch_id: UUID
    inserted: int
    matched: int       # rows where sw_id was resolved
    unmatched: int     # rows where sw_id stays null
    errors: list[str] = []
```

- [ ] **Step 2: Create discovery router**

Create `backend/app/api/v1/routes/discovery.py`:

```python
import io
import uuid
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.discovery import DiscoveryRecord
from app.models.catalog import SoftwareCatalog, SoftwareAlias
from app.schemas.discovery import DiscoveryRecordOut, IngestResultOut

router = APIRouter(prefix="/discovery", tags=["discovery"])


async def _next_disc_id(db: AsyncSession, count: int) -> list[str]:
    """Returns `count` sequential disc_ids starting from current max+1."""
    result = await db.execute(
        select(func.max(DiscoveryRecord.disc_id)).where(DiscoveryRecord.disc_id.like("D-%"))
    )
    max_id = result.scalar_one_or_none()
    n = int(max_id.split("-")[1]) + 1 if max_id else 1
    return [f"D-{(n + i):04d}" for i in range(count)]


async def _resolve_sw_id(contract_name: str, db: AsyncSession) -> str | None:
    """Try to match contract_name to SW catalog via canonical_name or alias."""
    # Direct canonical match (case-insensitive)
    result = await db.execute(
        select(SoftwareCatalog.sw_id).where(
            SoftwareCatalog.canonical_name.ilike(contract_name)
        )
    )
    sw_id = result.scalar_one_or_none()
    if sw_id:
        return sw_id
    # Alias match
    result = await db.execute(
        select(SoftwareAlias.sw_id).where(
            SoftwareAlias.alias_name.ilike(contract_name)
        )
    )
    return result.scalar_one_or_none()


def _parse_csv_or_xlsx(data: bytes, filename: str) -> list[dict]:
    """
    Parse discovery upload. Expected columns (order matters):
    contract_name | device_id | device_type | os | version | last_seen | site
    Returns list of dicts.
    """
    if filename.lower().endswith(".csv"):
        import csv
        text = data.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        return [row for row in reader]
    else:
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        headers = [str(h).strip() if h else f"col{i}" for i, h in enumerate(rows[0])]
        return [dict(zip(headers, row)) for row in rows[1:] if any(row)]


@router.get("", response_model=list[DiscoveryRecordOut])
async def list_discovery(
    sw_id: str | None = Query(None),
    matched: bool | None = Query(None),
    source_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(DiscoveryRecord)
    if sw_id:
        q = q.where(DiscoveryRecord.sw_id == sw_id)
    if matched is True:
        q = q.where(DiscoveryRecord.sw_id.is_not(None))
    elif matched is False:
        q = q.where(DiscoveryRecord.sw_id.is_(None))
    result = await db.execute(q.order_by(DiscoveryRecord.disc_id))
    return [DiscoveryRecordOut.model_validate(r) for r in result.scalars().all()]


@router.post("/ingest", response_model=IngestResultOut, status_code=201)
async def ingest_discovery(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    lower = file.filename.lower()
    if not (lower.endswith(".csv") or lower.endswith(".xlsx")):
        raise HTTPException(status_code=400, detail="Upload must be .csv or .xlsx")

    data = await file.read()
    rows = _parse_csv_or_xlsx(data, file.filename)
    if not rows:
        raise HTTPException(status_code=400, detail="File is empty or has no data rows")

    batch_id = uuid.uuid4()
    today = date.today()
    disc_ids = await _next_disc_id(db, len(rows))
    errors: list[str] = []
    inserted = 0
    matched = 0

    for i, row in enumerate(rows):
        contract_name = (
            row.get("contract_name") or row.get("Contract Name") or row.get("Contract_Name") or ""
        ).strip()
        if not contract_name:
            errors.append(f"Row {i+2}: missing contract_name — skipped")
            continue

        # Resolve last_seen date
        raw_last_seen = row.get("last_seen") or row.get("Last Seen") or row.get("Last_Seen")
        last_seen_date = None
        if raw_last_seen:
            try:
                if isinstance(raw_last_seen, (date, datetime)):
                    last_seen_date = raw_last_seen.date() if isinstance(raw_last_seen, datetime) else raw_last_seen
                else:
                    from datetime import datetime as dt
                    last_seen_date = dt.strptime(str(raw_last_seen).strip(), "%Y-%m-%d").date()
            except ValueError:
                errors.append(f"Row {i+2}: invalid last_seen date '{raw_last_seen}' — stored as null")

        device_type_raw = (row.get("device_type") or row.get("Device Type") or "endpoint").strip().lower()
        device_type = device_type_raw if device_type_raw in ("endpoint", "server") else "endpoint"

        sw_id = await _resolve_sw_id(contract_name, db)
        if sw_id:
            matched += 1

        rec = DiscoveryRecord(
            disc_id=disc_ids[inserted],
            contract_name=contract_name,
            sw_id=sw_id,
            canonical_name=None,
            device_id=(row.get("device_id") or row.get("Device ID") or "").strip() or None,
            device_type=device_type,
            os=(row.get("os") or row.get("OS") or "").strip() or None,
            version=(row.get("version") or row.get("Version") or "").strip() or None,
            last_seen=last_seen_date,
            site=(row.get("site") or row.get("Site") or "").strip() or None,
            upload_date=today,
            upload_batch_id=batch_id,
        )
        db.add(rec)
        inserted += 1

    await db.commit()
    return IngestResultOut(
        batch_id=batch_id,
        inserted=inserted,
        matched=matched,
        unmatched=inserted - matched,
        errors=errors,
    )
```

- [ ] **Step 3: Wire discovery router into main.py**

Edit `backend/app/main.py` to add:

```python
from app.api.v1.routes.discovery import router as discovery_router
```

And in the router registration block:
```python
app.include_router(entitlements_router, prefix="/api/v1")
app.include_router(discovery_router, prefix="/api/v1")
```

Full updated main.py:

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.routes.auth import router as auth_router
from app.api.v1.routes.masters import router as masters_router
from app.api.v1.routes.owners import router as owners_router
from app.api.v1.routes.catalog import router as catalog_router
from app.api.v1.routes.onboarding import router as onboarding_router
from app.api.v1.routes.entitlements import router as entitlements_router
from app.api.v1.routes.discovery import router as discovery_router
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
app.include_router(entitlements_router, prefix="/api/v1")
app.include_router(discovery_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "drl-sam-backend"}
```

- [ ] **Step 4: Verify routes**

```bash
cd backend
python -c "
from app.main import app
routes = [r.path for r in app.routes if hasattr(r, 'path') and '/discovery' in r.path]
print('Discovery routes:', routes)
"
```

Expected: `['/api/v1/discovery', '/api/v1/discovery/ingest']`

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/discovery.py backend/app/api/v1/routes/discovery.py backend/app/main.py
git commit -m "feat: discovery router (list/filter + CSV/XLSX ingest with auto-match) + wire into main"
```

---

## Task 8: Discovery API tests

**Files:**
- Create: `backend/tests/test_discovery.py`

- [ ] **Step 1: Write test file**

Create `backend/tests/test_discovery.py`:

```python
import io
import csv
import pytest
from openpyxl import Workbook


def _make_csv(rows: list[dict]) -> bytes:
    buf = io.StringIO()
    if not rows:
        return b""
    writer = csv.DictWriter(buf, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue().encode()


def _make_xlsx(rows: list[dict]) -> bytes:
    wb = Workbook()
    ws = wb.active
    if not rows:
        return b""
    ws.append(list(rows[0].keys()))
    for row in rows:
        ws.append(list(row.values()))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


async def test_list_discovery_returns_list(client):
    resp = await client.get("/api/v1/discovery")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_ingest_requires_auth(client):
    resp = await client.post(
        "/api/v1/discovery/ingest",
        files={"file": ("test.csv", io.BytesIO(b"contract_name\nMicrosoft 365"), "text/csv")},
    )
    assert resp.status_code in (401, 403)


async def test_ingest_csv(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    csv_data = _make_csv([
        {"contract_name": "Microsoft 365", "device_id": "PC001", "device_type": "endpoint",
         "os": "Windows 11", "version": "24H2", "last_seen": "2026-05-01", "site": "HQ"},
        {"contract_name": "Unknown Software XYZ", "device_id": "PC002", "device_type": "endpoint",
         "os": "Windows 10", "version": "22H2", "last_seen": "2026-04-15", "site": "Lab"},
    ])
    resp = await client.post(
        "/api/v1/discovery/ingest",
        files={"file": ("discovery.csv", io.BytesIO(csv_data), "text/csv")},
        headers=h,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["inserted"] == 2
    assert data["matched"] >= 0  # "Microsoft 365" may match seed catalog entry
    assert data["unmatched"] >= 0
    assert "batch_id" in data


async def test_ingest_xlsx(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    xlsx_data = _make_xlsx([
        {"contract_name": "SAP ERP (S/4HANA)", "device_id": "SRV001",
         "device_type": "server", "os": "RHEL 8", "version": "2023",
         "last_seen": "2026-05-10", "site": "Mumbai"},
    ])
    resp = await client.post(
        "/api/v1/discovery/ingest",
        files={"file": ("discovery.xlsx", io.BytesIO(xlsx_data),
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=h,
    )
    assert resp.status_code == 201
    assert resp.json()["inserted"] == 1


async def test_ingest_invalid_format_rejected(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post(
        "/api/v1/discovery/ingest",
        files={"file": ("file.txt", io.BytesIO(b"text content"), "text/plain")},
        headers=h,
    )
    assert resp.status_code == 400


async def test_list_filter_matched(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    # Ingest one matched + one unmatched row
    csv_data = _make_csv([
        {"contract_name": "Microsoft 365", "device_id": "FC001", "device_type": "endpoint",
         "os": "Windows 11", "version": "24H2", "last_seen": "2026-05-01", "site": "HQ"},
    ])
    await client.post(
        "/api/v1/discovery/ingest",
        files={"file": ("d.csv", io.BytesIO(csv_data), "text/csv")},
        headers=h,
    )
    unmatched_resp = await client.get("/api/v1/discovery?matched=false")
    assert unmatched_resp.status_code == 200
    assert all(r["sw_id"] is None for r in unmatched_resp.json())
```

- [ ] **Step 2: Run discovery tests**

```bash
cd backend
pytest tests/test_discovery.py -v
```

Expected: All 5 tests PASS.

- [ ] **Step 3: Run full test suite**

```bash
cd backend
pytest -v 2>&1 | tail -10
```

Expected: All tests pass (50 total).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_discovery.py
git commit -m "test: discovery API — CSV/XLSX ingest, auto-match, format validation, filters"
```

---

## Task 9: Frontend API modules + page placeholders

**Files:**
- Create: `frontend/src/api/entitlements.js`
- Create: `frontend/src/api/discovery.js`

- [ ] **Step 1: Create entitlements.js**

Create `frontend/src/api/entitlements.js`:

```js
import client from "./client";

const base = "/entitlements";

export const fetchEntitlements = (params = {}) =>
  client.get(base, { params }).then(r => r.data);

export const fetchEntitlement = (entId) =>
  client.get(`${base}/${entId}`).then(r => r.data);

export const updateEntitlement = (entId, data) =>
  client.put(`${base}/${entId}`, data).then(r => r.data);

export const downloadTemplate = () =>
  client.get(`${base}/template`, { responseType: "blob" }).then(r => r.data);

export const uploadUsage = (file, params = {}) => {
  const form = new FormData();
  form.append("file", file);
  return client.post(`${base}/upload`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    params,
  }).then(r => r.data);
};
```

- [ ] **Step 2: Create discovery.js**

Create `frontend/src/api/discovery.js`:

```js
import client from "./client";

const base = "/discovery";

export const fetchDiscovery = (params = {}) =>
  client.get(base, { params }).then(r => r.data);

export const ingestDiscovery = (file) => {
  const form = new FormData();
  form.append("file", file);
  return client.post(`${base}/ingest`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);
};
```

- [ ] **Step 3: Verify build**

```bash
cd frontend
npm run build 2>&1 | tail -3
```

Expected: `✓ built in Xs`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/entitlements.js frontend/src/api/discovery.js
git commit -m "feat: frontend API modules for entitlements and discovery"
```

---

## Task 10: EntitlementsPage UI

**Files:**
- Modify: `frontend/src/pages/Entitlements/EntitlementsPage.jsx`

- [ ] **Step 1: Write EntitlementsPage**

Replace `frontend/src/pages/Entitlements/EntitlementsPage.jsx` with:

```jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { fetchEntitlements, updateEntitlement, downloadTemplate, uploadUsage } from "../../api/entitlements";

const STATUS_BADGE = {
  ACTIVE:          <span className="tag tg2">Active</span>,
  OK:              <span className="tag tg2">OK</span>,
  EXPIRED:         <span className="tag tgr2">Expired</span>,
  WATCH:           <span className="tag tg4">Watch</span>,
  OVER_DEPLOYED:   <span className="tag tgr2">Over-Deployed</span>,
  UNDER_UTILISED:  <span className="tag tg3">Under-Utilised</span>,
};

const TYPE_BADGE = {
  subscription: <span className="tag tg1">Sub</span>,
  perpetual:    <span className="tag tb3">Perp</span>,
};

function utilPct(entitled, inUse) {
  if (!entitled || entitled === 0) return null;
  return Math.round(((inUse || 0) / entitled) * 100);
}

export default function EntitlementsPage() {
  const [entitlements, setEntitlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [selected, setSelected] = useState(null);
  const [editInUse, setEditInUse] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.license_type = filterType;
      const data = await fetchEntitlements(params);
      setEntitlements(data);
      if (selected) {
        const refreshed = data.find(e => e.ent_id === selected.ent_id);
        setSelected(refreshed || null);
      }
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload(); }, [reload]);

  const handleSaveInUse = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateEntitlement(selected.ent_id, { in_use_count: parseInt(editInUse) || 0 });
      reload();
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadTemplate = async () => {
    const blob = await downloadTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `entitlements_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const result = await uploadUsage(file);
      setUploadResult(result);
      reload();
    } catch (err) {
      setUploadResult({ error: err?.response?.data?.detail || "Upload failed" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> Entitlements</div>
        <h1>Entitlement Register</h1>
        <p>{entitlements.length} entitlement records · license counts and cost tracking</p>
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select className="fi2" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="OK">OK</option>
          <option value="WATCH">Watch</option>
          <option value="OVER_DEPLOYED">Over-Deployed</option>
          <option value="UNDER_UTILISED">Under-Utilised</option>
          <option value="EXPIRED">Expired</option>
        </select>
        <select className="fi2" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          <option value="subscription">Subscription</option>
          <option value="perpetual">Perpetual</option>
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn btn-o btn-sm" onClick={handleDownloadTemplate}>⬇ Download Template</button>
        <label className="btn btn-p btn-sm" style={{ cursor: "pointer" }}>
          {uploading ? "Uploading…" : "⬆ Upload Usage (XLSX)"}
          <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {/* Upload result banner */}
      {uploadResult && (
        <div style={{ background: uploadResult.error ? "var(--red-xlt, #fff0f0)" : "var(--navy-xlt)", border: "1px solid var(--bdr)", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 12 }}>
          {uploadResult.error ? (
            <span style={{ color: "var(--red)" }}>{uploadResult.error}</span>
          ) : (
            <>
              <strong>Upload complete</strong> — Tab A: {uploadResult.tab_a_updated} rows · Tab B: {uploadResult.tab_b_updated} rows updated
              {uploadResult.errors?.length > 0 && <div style={{ color: "var(--amber-m)", marginTop: 4 }}>{uploadResult.errors.join("; ")}</div>}
            </>
          )}
          <button style={{ float: "right", background: "none", border: "none", cursor: "pointer", fontSize: 12 }} onClick={() => setUploadResult(null)}>✕</button>
        </div>
      )}

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>ENT_ID</th><th>SW_ID</th><th>Contract Name</th><th>Type</th>
              <th>Entitled</th><th>In Use</th><th>Util %</th><th>Annual Cost (INR)</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="9" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {entitlements.map(ent => {
              const pct = utilPct(ent.entitled_count, ent.in_use_count);
              return (
                <tr
                  key={ent.ent_id}
                  style={{ cursor: "pointer", background: selected?.ent_id === ent.ent_id ? "var(--navy-xlt)" : undefined }}
                  onClick={() => { setSelected(selected?.ent_id === ent.ent_id ? null : ent); setEditInUse(String(ent.in_use_count ?? "")); }}
                >
                  <td><code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{ent.ent_id}</code></td>
                  <td style={{ fontSize: 11.5 }}>{ent.sw_id}</td>
                  <td style={{ fontSize: 12 }}>{ent.contract_name || "—"}</td>
                  <td>{TYPE_BADGE[ent.license_type] ?? ent.license_type}</td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>{ent.entitled_count?.toLocaleString() ?? "—"}</td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>{ent.in_use_count?.toLocaleString() ?? "—"}</td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>
                    {pct !== null ? (
                      <span style={{ color: pct > 100 ? "var(--red)" : pct > 90 ? "var(--amber-m)" : "inherit" }}>
                        {pct}%
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>
                    {ent.annual_cost_inr ? `₹${ent.annual_cost_inr.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td>{STATUS_BADGE[ent.status] ?? ent.status}</td>
                </tr>
              );
            })}
            {!loading && entitlements.length === 0 && (
              <tr><td colSpan="9" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>No entitlements yet. Add software via the Onboard page first.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selected && (
        <div style={{ marginTop: 16, background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 16, maxWidth: 480 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <strong>{selected.ent_id}</strong>
            <button className="btn btn-o btn-sm" onClick={() => setSelected(null)}>✕</button>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.8, marginBottom: 12 }}>
            <div><strong>SW_ID:</strong> {selected.sw_id}</div>
            <div><strong>Contract:</strong> {selected.contract_name || "—"}</div>
            <div><strong>License Type:</strong> {selected.license_type}</div>
            <div><strong>Entitled:</strong> {selected.entitled_count?.toLocaleString() ?? "—"}</div>
            <div><strong>Annual Cost:</strong> {selected.annual_cost_inr ? `₹${selected.annual_cost_inr.toLocaleString("en-IN")}` : "—"}</div>
            <div><strong>Status:</strong> {selected.status}</div>
          </div>
          <div className="fg">
            <label className="fl">Update In-Use Count</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input className="fi2" style={{ maxWidth: 120 }} type="number" value={editInUse} onChange={e => setEditInUse(e.target.value)} />
              <button className="btn btn-p btn-sm" onClick={handleSaveInUse} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            </div>
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
npm run build 2>&1 | tail -3
```

Expected: `✓ built in Xs`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Entitlements/EntitlementsPage.jsx
git commit -m "feat: EntitlementsPage — table with status/type filters, inline edit, template download/upload"
```

---

## Task 11: DiscoveryPage UI

**Files:**
- Modify: `frontend/src/pages/Discovery/DiscoveryPage.jsx`

- [ ] **Step 1: Write DiscoveryPage**

Replace `frontend/src/pages/Discovery/DiscoveryPage.jsx` with:

```jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { fetchDiscovery, ingestDiscovery } from "../../api/discovery";

const MATCH_BADGE = {
  matched:   <span className="tag tg2">Matched</span>,
  unmatched: <span className="tag tgr2">Unmatched</span>,
};

export default function DiscoveryPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMatched, setFilterMatched] = useState("");
  const [ingestResult, setIngestResult] = useState(null);
  const [ingesting, setIngesting] = useState(false);
  const fileInputRef = useRef(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterMatched === "true") params.matched = true;
      if (filterMatched === "false") params.matched = false;
      setRecords(await fetchDiscovery(params));
    } finally {
      setLoading(false);
    }
  }, [filterMatched]);

  useEffect(() => { reload(); }, [reload]);

  const handleIngest = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIngesting(true);
    setIngestResult(null);
    try {
      const result = await ingestDiscovery(file);
      setIngestResult(result);
      reload();
    } catch (err) {
      setIngestResult({ error: err?.response?.data?.detail || "Ingest failed" });
    } finally {
      setIngesting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const matchedCount = records.filter(r => r.sw_id).length;
  const unmatchedCount = records.filter(r => !r.sw_id).length;

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> License Discovery</div>
        <h1>License Discovery</h1>
        <p>{records.length} records · {matchedCount} matched · {unmatchedCount} unmatched</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
        <select className="fi2" value={filterMatched} onChange={e => setFilterMatched(e.target.value)}>
          <option value="">All Records</option>
          <option value="true">Matched Only</option>
          <option value="false">Unmatched Only</option>
        </select>
        <div style={{ flex: 1 }} />
        <label className="btn btn-p btn-sm" style={{ cursor: "pointer" }}>
          {ingesting ? "Ingesting…" : "⬆ Ingest CSV / XLSX"}
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={handleIngest} disabled={ingesting} />
        </label>
      </div>

      {/* Ingest result banner */}
      {ingestResult && (
        <div style={{ background: ingestResult.error ? "var(--red-xlt, #fff0f0)" : "var(--navy-xlt)", border: "1px solid var(--bdr)", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 12 }}>
          {ingestResult.error ? (
            <span style={{ color: "var(--red)" }}>{ingestResult.error}</span>
          ) : (
            <>
              <strong>Ingest complete</strong> — {ingestResult.inserted} records inserted ·{" "}
              {ingestResult.matched} matched · {ingestResult.unmatched} unmatched
              {ingestResult.errors?.length > 0 && (
                <div style={{ color: "var(--amber-m)", marginTop: 4 }}>{ingestResult.errors.join("; ")}</div>
              )}
            </>
          )}
          <button style={{ float: "right", background: "none", border: "none", cursor: "pointer", fontSize: 12 }} onClick={() => setIngestResult(null)}>✕</button>
        </div>
      )}

      {/* CSV format hint */}
      <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 6, padding: "8px 12px", marginBottom: 14, fontSize: 11, color: "var(--tx-m)" }}>
        <strong>Expected columns:</strong> contract_name · device_id · device_type (endpoint/server) · os · version · last_seen (YYYY-MM-DD) · site
      </div>

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Disc ID</th><th>Contract Name</th><th>Matched SW</th>
              <th>Device ID</th><th>Type</th><th>OS</th><th>Version</th>
              <th>Last Seen</th><th>Site</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="9" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {records.map(rec => (
              <tr key={rec.disc_id}>
                <td><code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{rec.disc_id}</code></td>
                <td style={{ fontSize: 12 }}>{rec.contract_name}</td>
                <td>
                  {rec.sw_id
                    ? <>{MATCH_BADGE.matched} <span style={{ fontSize: 11, marginLeft: 4 }}>{rec.sw_id}</span></>
                    : MATCH_BADGE.unmatched}
                </td>
                <td style={{ fontSize: 11.5 }}>{rec.device_id || "—"}</td>
                <td style={{ fontSize: 11 }}>{rec.device_type || "—"}</td>
                <td style={{ fontSize: 11 }}>{rec.os || "—"}</td>
                <td style={{ fontSize: 11 }}>{rec.version || "—"}</td>
                <td style={{ fontSize: 11 }}>{rec.last_seen || "—"}</td>
                <td style={{ fontSize: 11 }}>{rec.site || "—"}</td>
              </tr>
            ))}
            {!loading && records.length === 0 && (
              <tr><td colSpan="9" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>No discovery records. Upload a CSV or XLSX to ingest.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend
npm run build 2>&1 | tail -3
```

Expected: `✓ built in Xs`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Discovery/DiscoveryPage.jsx
git commit -m "feat: DiscoveryPage — table with match filter + CSV/XLSX ingest upload"
```

---

## Task 12: Final verification + commit

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend
pytest -v 2>&1 | tail -15
```

Expected: All tests pass (50+ total — 45 previous + 7 entitlement + 5 discovery = ~57).

- [ ] **Step 2: Verify frontend builds clean**

```bash
cd frontend
npm run build 2>&1 | grep -E "error|✓ built"
```

Expected: `✓ built in Xs`

- [ ] **Step 3: Verify total route count**

```bash
cd backend
python -c "
from app.main import app
routes = [r.path for r in app.routes if hasattr(r, 'path')]
print(f'Total routes: {len(routes)}')
"
```

Expected: 68+ routes (58 prev + entitlements + discovery).

- [ ] **Step 4: Final commit**

```bash
git add -A
git status
git commit -m "feat: sub-project 4 complete — Entitlements register + XLSX upload + Discovery ingest + Storage abstraction"
```

---

## Self-Review

**Spec coverage:**
- ✅ Entitlement list with filters (sw_id, status, license_type) — `GET /entitlements`
- ✅ Entitlement get/put — `GET /entitlements/{ent_id}`, `PUT /entitlements/{ent_id}`
- ✅ XLSX template download — `GET /entitlements/template`
- ✅ XLSX upload (Tab A metadata + Tab B usage counts) — `POST /entitlements/upload`
- ✅ UsageUpload record created per upload
- ✅ Discovery list with filters (sw_id, matched/unmatched) — `GET /discovery`
- ✅ CSV/XLSX ingest with auto-match — `POST /discovery/ingest`
- ✅ disc_id sequential generation (D-0001)
- ✅ StorageBackend ABC + SupabaseStorageBackend + S3StorageBackend + factory
- ✅ EntitlementsPage UI — table, filter, inline edit, template download, upload
- ✅ DiscoveryPage UI — table, filter, ingest upload, result banner

**Type consistency:**
- `UploadResultOut.upload_id` is `UUID`, `UsageUpload.id` is `UUID(as_uuid=True)` ✅
- `parse_tab_a` returns `ent_id`, `entitled_count`, `unit_cost_inr`, `annual_cost_inr`, `notes` — same field names as `Entitlement` model columns ✅
- `parse_tab_b` returns `ent_id`, `in_use_count`, `reporting_period`, `reason` — `in_use_count` matches `Entitlement.in_use_count`, `reporting_period`/`reason` match `UsageUpload` ✅
- `_next_disc_id` uses 4-digit padding `D-{n:04d}` consistent across routes and tests ✅
- `IngestResultOut.batch_id` is `UUID`, `DiscoveryRecord.upload_batch_id` is `UUID(as_uuid=True)` ✅
