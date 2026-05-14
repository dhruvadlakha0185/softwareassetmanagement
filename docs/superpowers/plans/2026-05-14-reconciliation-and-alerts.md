# Reconciliation + Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reconciliation engine (entitled vs. in-use computation with GPT-4o recommendations), the daily alert scheduler (renewal and utilisation alerts), and the supporting frontend pages + bell counter.

**Architecture:** A pure-Python reconciliation engine function runs entitlement logic and calls the GPT-4o recon advisor; an APScheduler `AsyncIOScheduler` fires two daily jobs (alerts generator at midnight UTC, no archiver yet); FastAPI routes expose `POST /reconciliation/run`, `GET /reconciliation/results/*`, `GET /alerts`, `POST /alerts/{id}/read`, `GET /alerts/counts`; the React alertStore polls `/alerts/counts` every 60 s and drives the TopBar notification dot.

**Tech Stack:** FastAPI · APScheduler≥3.10 · SQLAlchemy async · OpenAI gpt-4o (mocked in tests) · React 18 · Zustand · DRL CSS design system

---

## File Map

**Create:**
- `backend/app/services/ai/recon_advisor.py` — GPT-4o recon recommendations
- `backend/app/services/reconciliation_engine.py` — compute status + util_pct, call advisor, write DB records
- `backend/app/services/alert_generator.py` — check expiry windows + util thresholds, write Alert rows
- `backend/app/schemas/reconciliation.py` — Pydantic schemas for recon run + results
- `backend/app/schemas/alerts.py` — Pydantic schemas for Alert + counts
- `backend/app/api/v1/routes/reconciliation.py` — POST /run, GET /results, GET /results/latest
- `backend/app/api/v1/routes/alerts.py` — GET /alerts, POST /alerts/{id}/read, GET /alerts/counts
- `backend/tests/test_reconciliation.py`
- `backend/tests/test_alerts.py`
- `frontend/src/api/reconciliation.js`
- `frontend/src/api/alerts.js`

**Modify:**
- `backend/requirements.txt` — add APScheduler≥3.10.0
- `backend/app/main.py` — register routers + APScheduler lifespan jobs
- `frontend/src/store/alertStore.js` — add fetchUnreadCount() action
- `frontend/src/App.jsx` — call fetchUnreadCount on mount + poll every 60s

**Replace (placeholders):**
- `frontend/src/pages/Reconciliation/ReconciliationPage.jsx`
- `frontend/src/pages/Alerts/AlertsPage.jsx`

---

## Task 1: Add APScheduler to requirements

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add APScheduler**

Replace `backend/requirements.txt`:

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
APScheduler>=3.10.0
```

- [ ] **Step 2: Install**

```bash
cd backend
pip install "APScheduler>=3.10.0"
```

Expected: installs cleanly.

- [ ] **Step 3: Verify import**

```bash
cd backend
python -c "from apscheduler.schedulers.asyncio import AsyncIOScheduler; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt
git commit -m "feat: add APScheduler for daily alert + archival jobs"
```

---

## Task 2: Reconciliation AI advisor service

**Files:**
- Create: `backend/app/services/ai/recon_advisor.py`

- [ ] **Step 1: Create the advisor**

Create `backend/app/services/ai/recon_advisor.py`:

```python
"""
GPT-4o reconciliation advisor.
Takes a list of entitlement contexts, returns {ent_id: recommendation_text}.
Falls back to empty dict if OpenAI is unavailable.
"""
import json
from app.core.config import settings

SYSTEM_PROMPT = """You are a software license optimization advisor for Dr. Reddy's Laboratories.
Given a list of entitlements with utilisation data, return a JSON array of actionable recommendations.
Each item must have "ent_id" and "recommendation" fields.
Keep each recommendation to 1-2 specific, actionable sentences.
Consider: GxP compliance requirements (cannot simply remove GxP software), vendor audit risk,
license type (perpetual vs subscription), and cost impact."""


async def get_recommendations(contexts: list[dict]) -> dict[str, str]:
    """
    contexts: list of dicts with keys:
      ent_id, sw_name, util_pct, status, license_type,
      unit_cost_inr, entitled, in_use, is_gxp
    Returns: {ent_id: recommendation_text}
    If OpenAI unavailable (no key, timeout, etc.) returns {}.
    """
    if not contexts or settings.openai_api_key == "dummy":
        return {}
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        payload = json.dumps(contexts, default=str)
        response = await client.chat.completions.create(
            model="gpt-4o",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Entitlement contexts:\n{payload}\n\nReturn JSON: {{\"recommendations\": [{{\"ent_id\": ..., \"recommendation\": ...}}]}}"},
            ],
            temperature=0,
            timeout=60,
        )
        raw = json.loads(response.choices[0].message.content)
        items = raw.get("recommendations", [])
        return {item["ent_id"]: item["recommendation"] for item in items if "ent_id" in item}
    except Exception:
        return {}
```

- [ ] **Step 2: Verify import**

```bash
cd backend
python -c "from app.services.ai.recon_advisor import get_recommendations; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/ai/recon_advisor.py
git commit -m "feat: GPT-4o reconciliation advisor service"
```

---

## Task 3: Reconciliation engine service

**Files:**
- Create: `backend/app/services/reconciliation_engine.py`

- [ ] **Step 1: Create the engine**

Create `backend/app/services/reconciliation_engine.py`:

```python
"""
Reconciliation engine: computes util_pct and status for every entitlement,
calls the AI advisor, writes ReconciliationRun + ReconciliationResult rows,
and updates Entitlement.status in-place.
"""
from datetime import date, datetime
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.contracts import Entitlement, Contract
from app.models.reconciliation import ReconciliationRun, ReconciliationResult
from app.models.catalog import SoftwareCatalog
from app.services.ai.recon_advisor import get_recommendations


def _compute_recon_status(entitled: int | None, in_use: int | None) -> str:
    """Compute recon status from counts. Does NOT handle EXPIRED (that's on Entitlement)."""
    if not entitled or entitled == 0:
        return "OK"
    util = (in_use or 0) / entitled
    if util > 1.0:
        return "OVER_DEPLOYED"
    if util > 0.9:
        return "WATCH"
    if util < 0.3:
        return "UNDER_UTILISED"
    return "OK"


def _compute_util_pct(entitled: int | None, in_use: int | None) -> float | None:
    if not entitled or entitled == 0:
        return None
    return round((in_use or 0) / entitled * 100, 1)


async def run_reconciliation(
    db: AsyncSession,
    triggered_by_id: UUID | None = None,
) -> ReconciliationRun:
    """
    Full reconciliation pass. Returns the ReconciliationRun record.
    Safe to call with no entitlements (returns run with 0 processed).
    """
    run = ReconciliationRun(triggered_by=triggered_by_id)
    db.add(run)
    await db.flush()  # get run.id

    ents_result = await db.execute(select(Entitlement))
    ents = ents_result.scalars().all()

    # Build contexts for AI advisor
    contexts = []
    for ent in ents:
        sw = await db.get(SoftwareCatalog, ent.sw_id)
        contexts.append({
            "ent_id": ent.ent_id,
            "sw_name": sw.canonical_name if sw else ent.sw_id,
            "util_pct": _compute_util_pct(ent.entitled_count, ent.in_use_count),
            "status": _compute_recon_status(ent.entitled_count, ent.in_use_count),
            "license_type": ent.license_type,
            "unit_cost_inr": ent.unit_cost_inr,
            "entitled": ent.entitled_count,
            "in_use": ent.in_use_count,
            "is_gxp": sw.gxp_flag != "no" if sw else False,
        })

    # Get AI recommendations (best-effort)
    recommendations = await get_recommendations(contexts)

    # Write results + update Entitlement.status
    for ctx in contexts:
        ent_id = ctx["ent_id"]
        recon_status = ctx["status"]
        util_pct = ctx["util_pct"]

        # Check if contract expired
        ent = next(e for e in ents if e.ent_id == ent_id)
        if ent.contract_id:
            contract = await db.get(Contract, ent.contract_id)
            if contract and contract.end_date and contract.end_date < date.today():
                ent.status = "EXPIRED"
            else:
                ent.status = recon_status
        else:
            ent.status = recon_status

        result = ReconciliationResult(
            run_id=run.id,
            ent_id=ent_id,
            entitled=ctx["entitled"],
            in_use=ctx["in_use"],
            util_pct=util_pct,
            status=recon_status,
            ai_recommendation=recommendations.get(ent_id),
        )
        db.add(result)

    run.entitlements_processed = len(ents)
    await db.commit()
    await db.refresh(run)
    return run
```

- [ ] **Step 2: Verify import**

```bash
cd backend
python -c "from app.services.reconciliation_engine import run_reconciliation, _compute_recon_status; assert _compute_recon_status(100, 110) == 'OVER_DEPLOYED'; assert _compute_recon_status(100, 25) == 'UNDER_UTILISED'; assert _compute_recon_status(100, 95) == 'WATCH'; assert _compute_recon_status(100, 60) == 'OK'; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/reconciliation_engine.py
git commit -m "feat: reconciliation engine — util_pct/status compute + AI advisor + DB write"
```

---

## Task 4: Alert generator service

**Files:**
- Create: `backend/app/services/alert_generator.py`

- [ ] **Step 1: Create the alert generator**

Create `backend/app/services/alert_generator.py`:

```python
"""
Alert generator: checks all entitlements for renewal and utilisation alerts.
Idempotent — will not create duplicate alerts for the same entitlement + type on the same day.
Called by APScheduler daily at midnight UTC, and also manually via POST /reconciliation/run.
"""
from datetime import date, datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.contracts import Entitlement, Contract
from app.models.catalog import SoftwareCatalog
from app.models.alerts import Alert, AlertRead

RENEWAL_THRESHOLDS = [90, 60, 30, 15, 7, 1]


def _renewal_severity(days: int) -> str:
    if days <= 7:
        return "CRITICAL"
    if days <= 30:
        return "HIGH"
    if days <= 60:
        return "MEDIUM"
    return "INFO"


def _util_severity(util_pct: float) -> str:
    return "HIGH" if util_pct > 100 else "MEDIUM"


async def _alert_exists_today(
    db: AsyncSession,
    ent_id: str,
    alert_type: str,
    days_to_expiry: int | None = None,
) -> bool:
    today_start = datetime.combine(date.today(), datetime.min.time())
    q = select(Alert).where(
        Alert.ent_id == ent_id,
        Alert.alert_type == alert_type,
        Alert.created_at >= today_start,
    )
    if days_to_expiry is not None:
        q = q.where(Alert.days_to_expiry == days_to_expiry)
    result = await db.execute(q)
    return result.scalar_one_or_none() is not None


async def generate_alerts(db: AsyncSession) -> int:
    """
    Scan entitlements, create alerts where needed.
    Returns the count of new alerts created.
    """
    created = 0
    ents_result = await db.execute(select(Entitlement))
    ents = ents_result.scalars().all()

    for ent in ents:
        sw = await db.get(SoftwareCatalog, ent.sw_id)
        is_gxp = (sw.gxp_flag != "no") if sw else False
        sw_name = sw.canonical_name if sw else ent.sw_id

        # ── Renewal alerts ─────────────────────────────────────────────────────
        if ent.contract_id:
            contract = await db.get(Contract, ent.contract_id)
            if contract and contract.end_date:
                days = (contract.end_date - date.today()).days
                for threshold in RENEWAL_THRESHOLDS:
                    if days == threshold:
                        if not await _alert_exists_today(db, ent.ent_id, "RENEWAL", threshold):
                            db.add(Alert(
                                alert_type="RENEWAL",
                                ent_id=ent.ent_id,
                                severity=_renewal_severity(days),
                                days_to_expiry=days,
                                title=f"Renewal due in {days} day{'s' if days != 1 else ''}: {sw_name}",
                                body_json={
                                    "ent_id": ent.ent_id,
                                    "sw_name": sw_name,
                                    "end_date": str(contract.end_date),
                                    "days_to_expiry": days,
                                    "is_gxp": is_gxp,
                                },
                                is_gxp=is_gxp,
                            ))
                            created += 1

        # ── Utilisation alerts ─────────────────────────────────────────────────
        if ent.entitled_count and ent.entitled_count > 0 and ent.in_use_count is not None:
            util_pct = (ent.in_use_count / ent.entitled_count) * 100
            if util_pct > 90:
                if not await _alert_exists_today(db, ent.ent_id, "UTILISATION"):
                    label = "Over-deployed" if util_pct > 100 else "Watch threshold"
                    db.add(Alert(
                        alert_type="UTILISATION",
                        ent_id=ent.ent_id,
                        severity=_util_severity(util_pct),
                        days_to_expiry=None,
                        title=f"{label}: {sw_name} at {util_pct:.0f}%",
                        body_json={
                            "ent_id": ent.ent_id,
                            "sw_name": sw_name,
                            "util_pct": round(util_pct, 1),
                            "entitled": ent.entitled_count,
                            "in_use": ent.in_use_count,
                            "is_gxp": is_gxp,
                        },
                        is_gxp=is_gxp,
                    ))
                    created += 1

    await db.commit()
    return created
```

- [ ] **Step 2: Verify import**

```bash
cd backend
python -c "from app.services.alert_generator import generate_alerts, _renewal_severity; assert _renewal_severity(1) == 'CRITICAL'; assert _renewal_severity(30) == 'HIGH'; assert _renewal_severity(60) == 'MEDIUM'; assert _renewal_severity(90) == 'INFO'; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/alert_generator.py
git commit -m "feat: alert generator — renewal (T-90/60/30/15/7/1) + utilisation (>90%/100%) with daily dedup"
```

---

## Task 5: Reconciliation + Alert Pydantic schemas

**Files:**
- Create: `backend/app/schemas/reconciliation.py`
- Create: `backend/app/schemas/alerts.py`

- [ ] **Step 1: Create reconciliation schemas**

Create `backend/app/schemas/reconciliation.py`:

```python
from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class ReconRunOut(BaseModel):
    id: UUID
    run_date: datetime
    triggered_by: UUID | None = None
    entitlements_processed: int
    model_config = {"from_attributes": True}


class ReconResultOut(BaseModel):
    id: UUID
    run_id: UUID
    ent_id: str
    entitled: float | None = None
    in_use: float | None = None
    util_pct: float | None = None
    status: str | None = None
    ai_recommendation: str | None = None
    generated_at: datetime
    model_config = {"from_attributes": True}


class ReconRunWithResults(BaseModel):
    run: ReconRunOut
    results: list[ReconResultOut]
```

- [ ] **Step 2: Create alert schemas**

Create `backend/app/schemas/alerts.py`:

```python
from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class AlertOut(BaseModel):
    id: UUID
    alert_type: str
    ent_id: str | None = None
    severity: str
    days_to_expiry: int | None = None
    title: str
    body_json: dict | None = None
    is_gxp: bool
    created_at: datetime
    is_read: bool = False       # computed from alert_reads for current user
    model_config = {"from_attributes": True}


class AlertCountsOut(BaseModel):
    total_unread: int
    critical: int
    high: int
    medium: int
    info: int
```

- [ ] **Step 3: Verify imports**

```bash
cd backend
python -c "
from app.schemas.reconciliation import ReconRunOut, ReconResultOut, ReconRunWithResults
from app.schemas.alerts import AlertOut, AlertCountsOut
print('OK')
"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/reconciliation.py backend/app/schemas/alerts.py
git commit -m "feat: reconciliation + alert Pydantic schemas"
```

---

## Task 6: Reconciliation router + wire into main.py

**Files:**
- Create: `backend/app/api/v1/routes/reconciliation.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create reconciliation router**

Create `backend/app/api/v1/routes/reconciliation.py`:

```python
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.api.deps import get_current_user, require_role
from app.models.reconciliation import ReconciliationRun, ReconciliationResult
from app.schemas.reconciliation import ReconRunOut, ReconResultOut, ReconRunWithResults
from app.services.reconciliation_engine import run_reconciliation

router = APIRouter(prefix="/reconciliation", tags=["reconciliation"])
admin_only = Depends(require_role(["COE_ADMIN"]))


@router.post("/run", response_model=ReconRunWithResults, status_code=201, dependencies=[admin_only])
async def trigger_reconciliation(
    current_user=Depends(require_role(["COE_ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    run = await run_reconciliation(db, triggered_by_id=current_user.id)
    results_q = await db.execute(
        select(ReconciliationResult).where(ReconciliationResult.run_id == run.id)
    )
    results = [ReconResultOut.model_validate(r) for r in results_q.scalars().all()]
    return ReconRunWithResults(run=ReconRunOut.model_validate(run), results=results)


@router.get("/results", response_model=list[ReconRunOut])
async def list_runs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ReconciliationRun).order_by(ReconciliationRun.run_date.desc()).limit(20)
    )
    return [ReconRunOut.model_validate(r) for r in result.scalars().all()]


@router.get("/results/latest", response_model=ReconRunWithResults)
async def latest_run(db: AsyncSession = Depends(get_db)):
    run_result = await db.execute(
        select(ReconciliationRun).order_by(ReconciliationRun.run_date.desc()).limit(1)
    )
    run = run_result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="No reconciliation runs found")
    results_q = await db.execute(
        select(ReconciliationResult).where(ReconciliationResult.run_id == run.id)
    )
    results = [ReconResultOut.model_validate(r) for r in results_q.scalars().all()]
    return ReconRunWithResults(run=ReconRunOut.model_validate(run), results=results)


@router.get("/results/{run_id}", response_model=ReconRunWithResults)
async def get_run(run_id: UUID, db: AsyncSession = Depends(get_db)):
    run = await db.get(ReconciliationRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    results_q = await db.execute(
        select(ReconciliationResult).where(ReconciliationResult.run_id == run_id)
    )
    results = [ReconResultOut.model_validate(r) for r in results_q.scalars().all()]
    return ReconRunWithResults(run=ReconRunOut.model_validate(run), results=results)
```

- [ ] **Step 2: Wire reconciliation router into main.py**

Edit `backend/app/main.py` — add the import and include_router:

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
from app.api.v1.routes.reconciliation import router as reconciliation_router
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
app.include_router(reconciliation_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "drl-sam-backend"}
```

- [ ] **Step 3: Verify routes**

```bash
cd backend
python -c "
from app.main import app
routes = [r.path for r in app.routes if hasattr(r, 'path') and '/reconciliation' in r.path]
print('Recon routes:', routes)
"
```

Expected: `['/api/v1/reconciliation/run', '/api/v1/reconciliation/results', '/api/v1/reconciliation/results/latest', '/api/v1/reconciliation/results/{run_id}']`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/routes/reconciliation.py backend/app/main.py
git commit -m "feat: reconciliation router (POST /run, GET /results, GET /results/latest) + wire into main"
```

---

## Task 7: Alerts router + wire into main.py + APScheduler

**Files:**
- Create: `backend/app/api/v1/routes/alerts.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create alerts router**

Create `backend/app/api/v1/routes/alerts.py`:

```python
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.alerts import Alert, AlertRead
from app.schemas.alerts import AlertOut, AlertCountsOut

router = APIRouter(prefix="/alerts", tags=["alerts"])


async def _is_read(db: AsyncSession, alert_id: UUID, user_id: UUID) -> bool:
    result = await db.execute(
        select(AlertRead).where(
            AlertRead.alert_id == alert_id,
            AlertRead.user_id == user_id,
        )
    )
    return result.scalar_one_or_none() is not None


@router.get("", response_model=list[AlertOut])
async def list_alerts(
    alert_type: str | None = Query(None),
    severity: str | None = Query(None),
    unread_only: bool = Query(False),
    limit: int = Query(100, le=500),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Alert).order_by(Alert.created_at.desc()).limit(limit)
    if alert_type:
        q = q.where(Alert.alert_type == alert_type)
    if severity:
        q = q.where(Alert.severity == severity)
    result = await db.execute(q)
    alerts = result.scalars().all()

    out = []
    for a in alerts:
        is_read = await _is_read(db, a.id, current_user.id)
        if unread_only and is_read:
            continue
        item = AlertOut.model_validate(a)
        item.is_read = is_read
        out.append(item)
    return out


@router.post("/{alert_id}/read", status_code=204)
async def mark_read(
    alert_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    already = await _is_read(db, alert_id, current_user.id)
    if not already:
        db.add(AlertRead(alert_id=alert_id, user_id=current_user.id))
        await db.commit()


@router.get("/counts", response_model=AlertCountsOut)
async def alert_counts(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get all alert IDs already read by this user
    read_result = await db.execute(
        select(AlertRead.alert_id).where(AlertRead.user_id == current_user.id)
    )
    read_ids = {row[0] for row in read_result.fetchall()}

    # Get all alerts
    all_alerts_result = await db.execute(select(Alert))
    all_alerts = all_alerts_result.scalars().all()

    unread = [a for a in all_alerts if a.id not in read_ids]
    return AlertCountsOut(
        total_unread=len(unread),
        critical=sum(1 for a in unread if a.severity == "CRITICAL"),
        high=sum(1 for a in unread if a.severity == "HIGH"),
        medium=sum(1 for a in unread if a.severity == "MEDIUM"),
        info=sum(1 for a in unread if a.severity == "INFO"),
    )
```

- [ ] **Step 2: Add APScheduler jobs + alerts router into main.py**

Replace `backend/app/main.py` with the full version including scheduler:

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
from app.api.v1.routes.reconciliation import router as reconciliation_router
from app.api.v1.routes.alerts import router as alerts_router
from app.core.config import settings


async def _run_scheduled_alerts():
    """Scheduled job: generate alerts for all entitlements."""
    from app.core.database import AsyncSessionLocal
    from app.services.alert_generator import generate_alerts
    async with AsyncSessionLocal() as db:
        count = await generate_alerts(db)
        print(f"[scheduler] Alert generator: {count} new alerts created")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-seed on local dev
    if settings.storage_backend in ("supabase", "local"):
        try:
            from scripts.seed import seed
            await seed()
        except Exception as e:
            print(f"Seed skipped: {e}")

    # Start APScheduler
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(_run_scheduled_alerts, "cron", hour=0, minute=0, id="daily_alerts")
    scheduler.start()

    yield

    scheduler.shutdown(wait=False)


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
app.include_router(reconciliation_router, prefix="/api/v1")
app.include_router(alerts_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "drl-sam-backend"}
```

- [ ] **Step 3: Verify all routes**

```bash
cd backend
python -c "
from app.main import app
routes = [r.path for r in app.routes if hasattr(r, 'path')]
print(f'Total routes: {len(routes)}')
alert_routes = [r for r in routes if '/alerts' in r]
print('Alert routes:', alert_routes)
"
```

Expected: 70+ total routes. Alert routes include `/api/v1/alerts`, `/api/v1/alerts/{alert_id}/read`, `/api/v1/alerts/counts`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/routes/alerts.py backend/app/main.py
git commit -m "feat: alerts router (list/read/counts) + APScheduler daily alert job"
```

---

## Task 8: Reconciliation API tests

**Files:**
- Create: `backend/tests/test_reconciliation.py`

- [ ] **Step 1: Write test file**

Create `backend/tests/test_reconciliation.py`:

```python
import pytest
from unittest.mock import patch, AsyncMock


async def test_run_reconciliation_requires_admin(client):
    resp = await client.post("/api/v1/reconciliation/run")
    assert resp.status_code in (401, 403)


async def test_run_reconciliation(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    with patch("app.services.reconciliation_engine.get_recommendations", new_callable=AsyncMock) as mock_ai:
        mock_ai.return_value = {}
        resp = await client.post("/api/v1/reconciliation/run", headers=h)
    assert resp.status_code == 201
    data = resp.json()
    assert "run" in data
    assert "results" in data
    assert data["run"]["entitlements_processed"] >= 0


async def test_list_runs(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    with patch("app.services.reconciliation_engine.get_recommendations", new_callable=AsyncMock) as mock_ai:
        mock_ai.return_value = {}
        await client.post("/api/v1/reconciliation/run", headers=h)

    resp = await client.get("/api/v1/reconciliation/results")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) >= 1


async def test_latest_run(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    with patch("app.services.reconciliation_engine.get_recommendations", new_callable=AsyncMock) as mock_ai:
        mock_ai.return_value = {}
        create_resp = await client.post("/api/v1/reconciliation/run", headers=h)
    run_id = create_resp.json()["run"]["id"]

    resp = await client.get("/api/v1/reconciliation/results/latest")
    assert resp.status_code == 200
    assert resp.json()["run"]["id"] == run_id


async def test_recon_computes_status(client, admin_token):
    """Verify that an over-deployed entitlement gets OVER_DEPLOYED status."""
    h = {"Authorization": f"Bearer {admin_token}"}

    # Create an entitlement with in_use > entitled
    publish = (await client.post("/api/v1/onboarding/publish", json={
        "canonical_name": "ReconTest Software",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
        "line_items": [{"contract_name": "ReconTest Sub", "license_type": "subscription", "entitled_count": 50}],
    }, headers=h)).json()
    ent_id = publish["ent_ids"][0]

    # Update in_use to be > entitled (over-deployed)
    await client.put(f"/api/v1/entitlements/{ent_id}", json={"in_use_count": 75}, headers=h)

    with patch("app.services.reconciliation_engine.get_recommendations", new_callable=AsyncMock) as mock_ai:
        mock_ai.return_value = {ent_id: "Consider purchasing additional licenses."}
        resp = await client.post("/api/v1/reconciliation/run", headers=h)

    assert resp.status_code == 201
    results = resp.json()["results"]
    our_result = next((r for r in results if r["ent_id"] == ent_id), None)
    assert our_result is not None
    assert our_result["status"] == "OVER_DEPLOYED"
    assert our_result["ai_recommendation"] == "Consider purchasing additional licenses."

    # Verify Entitlement.status was updated
    ent = (await client.get(f"/api/v1/entitlements/{ent_id}")).json()
    assert ent["status"] == "OVER_DEPLOYED"
```

- [ ] **Step 2: Run reconciliation tests**

```bash
cd backend
pytest tests/test_reconciliation.py -v
```

Expected: All 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_reconciliation.py
git commit -m "test: reconciliation API — run, list, latest, status computation, AI recommendation"
```

---

## Task 9: Alerts API tests

**Files:**
- Create: `backend/tests/test_alerts.py`

- [ ] **Step 1: Write test file**

Create `backend/tests/test_alerts.py`:

```python
import pytest
from app.models.alerts import Alert
from app.models.contracts import Entitlement


@pytest.fixture
async def sample_alert(db, admin_token, client):
    """Create a UTILISATION alert via the alert generator on a high-usage entitlement."""
    h = {"Authorization": f"Bearer {admin_token}"}
    # Create entitlement with high in_use
    publish = (await client.post("/api/v1/onboarding/publish", json={
        "canonical_name": "AlertTest Software",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
        "line_items": [{"contract_name": "AlertTest Sub", "license_type": "subscription", "entitled_count": 100}],
    }, headers=h)).json()
    ent_id = publish["ent_ids"][0]
    await client.put(f"/api/v1/entitlements/{ent_id}", json={"in_use_count": 110}, headers=h)

    # Call alert generator directly
    from app.services.alert_generator import generate_alerts
    count = await generate_alerts(db)
    assert count >= 1

    # Find the alert we just created
    from sqlalchemy import select
    result = await db.execute(
        select(Alert).where(Alert.ent_id == ent_id, Alert.alert_type == "UTILISATION")
    )
    alert = result.scalar_one_or_none()
    assert alert is not None
    yield alert


async def test_list_alerts_requires_auth(client):
    resp = await client.get("/api/v1/alerts")
    assert resp.status_code in (401, 403)


async def test_list_alerts(client, admin_token, sample_alert):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/alerts", headers=h)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) >= 1


async def test_alert_has_expected_fields(client, admin_token, sample_alert):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/alerts", headers=h)
    alert = next(a for a in resp.json() if a["id"] == str(sample_alert.id))
    assert alert["alert_type"] == "UTILISATION"
    assert alert["severity"] in ("HIGH", "MEDIUM")
    assert "title" in alert
    assert alert["is_read"] is False


async def test_mark_alert_read(client, admin_token, sample_alert):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post(f"/api/v1/alerts/{sample_alert.id}/read", headers=h)
    assert resp.status_code == 204

    # Appears as read in list
    alerts = (await client.get("/api/v1/alerts", headers=h)).json()
    alert = next(a for a in alerts if a["id"] == str(sample_alert.id))
    assert alert["is_read"] is True


async def test_alert_counts(client, admin_token, sample_alert):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/alerts/counts", headers=h)
    assert resp.status_code == 200
    data = resp.json()
    assert "total_unread" in data
    assert "critical" in data
    assert data["total_unread"] >= 1


async def test_alert_filter_by_type(client, admin_token, sample_alert):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/alerts?alert_type=UTILISATION", headers=h)
    assert resp.status_code == 200
    assert all(a["alert_type"] == "UTILISATION" for a in resp.json())


async def test_dedup_no_duplicate_alerts_same_day(db, admin_token, client):
    """Calling generate_alerts twice on the same day should not create duplicates."""
    h = {"Authorization": f"Bearer {admin_token}"}
    publish = (await client.post("/api/v1/onboarding/publish", json={
        "canonical_name": "DedupTest Software",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
        "line_items": [{"contract_name": "DedupTest Sub", "license_type": "subscription", "entitled_count": 100}],
    }, headers=h)).json()
    ent_id = publish["ent_ids"][0]
    await client.put(f"/api/v1/entitlements/{ent_id}", json={"in_use_count": 110}, headers=h)

    from app.services.alert_generator import generate_alerts
    from sqlalchemy import select

    count1 = await generate_alerts(db)
    count2 = await generate_alerts(db)

    # Second run should create 0 new alerts for this entitlement
    result = await db.execute(
        select(Alert).where(Alert.ent_id == ent_id, Alert.alert_type == "UTILISATION")
    )
    util_alerts = result.scalars().all()
    assert len(util_alerts) == 1  # exactly one, not two
```

- [ ] **Step 2: Run alerts tests**

```bash
cd backend
pytest tests/test_alerts.py -v
```

Expected: All 7 tests PASS.

- [ ] **Step 3: Run full suite**

```bash
cd backend
pytest -v 2>&1 | tail -5
```

Expected: All 70+ tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_alerts.py
git commit -m "test: alerts API — list, mark-read, counts, filter, dedup idempotency"
```

---

## Task 10: Frontend API modules

**Files:**
- Create: `frontend/src/api/reconciliation.js`
- Create: `frontend/src/api/alerts.js`

- [ ] **Step 1: Create reconciliation.js**

Create `frontend/src/api/reconciliation.js`:

```js
import client from "./client";

const base = "/reconciliation";

export const triggerRun = () =>
  client.post(`${base}/run`).then(r => r.data);

export const fetchRuns = () =>
  client.get(`${base}/results`).then(r => r.data);

export const fetchLatestRun = () =>
  client.get(`${base}/results/latest`).then(r => r.data);

export const fetchRun = (runId) =>
  client.get(`${base}/results/${runId}`).then(r => r.data);
```

- [ ] **Step 2: Create alerts.js**

Create `frontend/src/api/alerts.js`:

```js
import client from "./client";

const base = "/alerts";

export const fetchAlerts = (params = {}) =>
  client.get(base, { params }).then(r => r.data);

export const markAlertRead = (alertId) =>
  client.post(`${base}/${alertId}/read`);

export const fetchAlertCounts = () =>
  client.get(`${base}/counts`).then(r => r.data);
```

- [ ] **Step 3: Update alertStore to expose fetchUnreadCount**

Replace `frontend/src/store/alertStore.js`:

```js
import { create } from "zustand";
import { fetchAlertCounts } from "../api/alerts";

const useAlertStore = create((set) => ({
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: count }),
  fetchUnreadCount: async () => {
    try {
      const data = await fetchAlertCounts();
      set({ unreadCount: data.total_unread });
    } catch {
      // silently fail — bell just shows 0
    }
  },
}));

export default useAlertStore;
```

- [ ] **Step 4: Wire fetchUnreadCount into App.jsx**

Replace `frontend/src/App.jsx`:

```jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import AppLayout from "./components/layout/AppLayout";
import PrivateRoute from "./components/shared/PrivateRoute";
import LoginPage from "./pages/Login/LoginPage";
import DashboardPage from "./pages/Dashboard/DashboardPage";
import CatalogPage from "./pages/Catalog/CatalogPage";
import EntitlementsPage from "./pages/Entitlements/EntitlementsPage";
import DiscoveryPage from "./pages/Discovery/DiscoveryPage";
import OnboardingPage from "./pages/Onboarding/OnboardingPage";
import ReconciliationPage from "./pages/Reconciliation/ReconciliationPage";
import CostOptPage from "./pages/CostOpt/CostOptPage";
import AuditTrailPage from "./pages/AuditTrail/AuditTrailPage";
import AlertsPage from "./pages/Alerts/AlertsPage";
import AppOwnersPage from "./pages/AppOwners/AppOwnersPage";
import MastersPage from "./pages/Masters/MastersPage";
import useAuthStore from "./store/authStore";
import useAlertStore from "./store/alertStore";

function AuthInit({ children }) {
  const { token, user, fetchMe } = useAuthStore();
  const { fetchUnreadCount } = useAlertStore();

  useEffect(() => {
    if (token && !user) fetchMe();
  }, [token, user, fetchMe]);

  // Poll alert count every 60 s while authenticated
  useEffect(() => {
    if (!token) return;
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60_000);
    return () => clearInterval(interval);
  }, [token, fetchUnreadCount]);

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthInit>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            element={
              <PrivateRoute>
                <AppLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="entitlements" element={<EntitlementsPage />} />
            <Route path="discovery" element={<DiscoveryPage />} />
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route path="reconciliation" element={<ReconciliationPage />} />
            <Route path="cost-opt" element={<CostOptPage />} />
            <Route path="audit" element={<AuditTrailPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="owners" element={<AppOwnersPage />} />
            <Route path="masters" element={<MastersPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthInit>
    </BrowserRouter>
  );
}
```

- [ ] **Step 5: Verify build**

```bash
cd frontend
npm run build 2>&1 | tail -3
```

Expected: `✓ built in Xs`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/reconciliation.js frontend/src/api/alerts.js frontend/src/store/alertStore.js frontend/src/App.jsx
git commit -m "feat: reconciliation + alerts API modules; alertStore fetchUnreadCount; App.jsx 60s poll"
```

---

## Task 11: ReconciliationPage UI

**Files:**
- Modify: `frontend/src/pages/Reconciliation/ReconciliationPage.jsx`

- [ ] **Step 1: Write ReconciliationPage**

Replace `frontend/src/pages/Reconciliation/ReconciliationPage.jsx` with:

```jsx
import { useState, useEffect } from "react";
import { triggerRun, fetchLatestRun, fetchRuns } from "../../api/reconciliation";

const STATUS_BADGE = {
  OVER_DEPLOYED:  <span className="tag tgr2">Over-Deployed</span>,
  WATCH:          <span className="tag tg4">Watch</span>,
  OK:             <span className="tag tg2">OK</span>,
  UNDER_UTILISED: <span className="tag tg3">Under-Utilised</span>,
};

function UtilBar({ pct }) {
  if (pct === null || pct === undefined) return <span style={{ color: "var(--tx-q)", fontSize: 11 }}>—</span>;
  const color = pct > 100 ? "var(--red)" : pct > 90 ? "var(--amber-m)" : pct < 30 ? "var(--teal-m)" : "var(--green)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 60, height: 6, background: "var(--bdr)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 600 }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

export default function ReconciliationPage() {
  const [latestRun, setLatestRun] = useState(null);
  const [runs, setRuns] = useState([]);
  const [running, setRunning] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const loadLatest = async () => {
    setLoadingLatest(true);
    try {
      const data = await fetchLatestRun();
      setLatestRun(data);
    } catch {
      setLatestRun(null);
    } finally {
      setLoadingLatest(false);
    }
  };

  useEffect(() => {
    loadLatest();
    fetchRuns().then(setRuns).catch(() => {});
  }, []);

  const handleRun = async () => {
    setRunning(true);
    try {
      const result = await triggerRun();
      setLatestRun(result);
      fetchRuns().then(setRuns).catch(() => {});
    } catch (e) {
      alert(e?.response?.data?.detail || "Reconciliation failed");
    } finally {
      setRunning(false);
    }
  };

  const results = latestRun?.results || [];

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> Reconciliation</div>
        <h1>License Reconciliation</h1>
        <p>Entitled vs. in-use · AI recommendations · {results.length} entitlements in last run</p>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <button className="btn btn-p" onClick={handleRun} disabled={running}>
          {running ? "Running…" : "▶ Run Reconciliation Now"}
        </button>
        {latestRun && (
          <span style={{ fontSize: 12, color: "var(--tx-m)" }}>
            Last run: {new Date(latestRun.run.run_date).toLocaleString()} · {latestRun.run.entitlements_processed} processed
          </span>
        )}
      </div>

      {loadingLatest && <div style={{ color: "var(--tx-q)", fontSize: 13 }}>Loading last run…</div>}

      {results.length > 0 && (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>ENT_ID</th><th>Entitled</th><th>In Use</th><th>Util</th>
                <th>Status</th><th>AI Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.id}>
                  <td><code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{r.ent_id}</code></td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>{r.entitled?.toLocaleString() ?? "—"}</td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>{r.in_use?.toLocaleString() ?? "—"}</td>
                  <td><UtilBar pct={r.util_pct} /></td>
                  <td>{STATUS_BADGE[r.status] ?? r.status ?? "—"}</td>
                  <td style={{ fontSize: 11, color: "var(--tx-m)", maxWidth: 320 }}>
                    {r.ai_recommendation ? (
                      <div
                        style={{ cursor: "pointer", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: expandedId === r.id ? "unset" : 2, WebkitBoxOrient: "vertical" }}
                        onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                        title="Click to expand"
                      >
                        {r.ai_recommendation}
                      </div>
                    ) : <span style={{ color: "var(--tx-q)" }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loadingLatest && results.length === 0 && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 24, textAlign: "center", color: "var(--tx-q)" }}>
          No reconciliation runs yet. Click "Run Reconciliation Now" to start.
        </div>
      )}

      {runs.length > 1 && (
        <>
          <div className="sdiv" style={{ marginTop: 24 }}>Run History ({runs.length})</div>
          <div className="tw">
            <table>
              <thead><tr><th>Run Date</th><th>Entitlements Processed</th></tr></thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12 }}>{new Date(r.run_date).toLocaleString()}</td>
                    <td style={{ textAlign: "right", fontSize: 12 }}>{r.entitlements_processed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
git add frontend/src/pages/Reconciliation/ReconciliationPage.jsx
git commit -m "feat: ReconciliationPage — run button, util bar, AI recommendations, run history"
```

---

## Task 12: AlertsPage UI

**Files:**
- Modify: `frontend/src/pages/Alerts/AlertsPage.jsx`

- [ ] **Step 1: Write AlertsPage**

Replace `frontend/src/pages/Alerts/AlertsPage.jsx` with:

```jsx
import { useState, useEffect, useCallback } from "react";
import { fetchAlerts, markAlertRead } from "../../api/alerts";
import useAlertStore from "../../store/alertStore";

const SEVERITY_COLOR = {
  CRITICAL: { bg: "#fff0f0", border: "#e53e3e", badge: "tgr2" },
  HIGH:     { bg: "#fffaf0", border: "#dd6b20", badge: "tg4" },
  MEDIUM:   { bg: "#fffff0", border: "#d69e2e", badge: "tg4" },
  INFO:     { bg: "var(--navy-xlt)", border: "var(--navy-mid)", badge: "tg1" },
};

const TYPE_LABEL = { RENEWAL: "Renewal", UTILISATION: "Utilisation" };

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { fetchUnreadCount } = useAlertStore();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterType) params.alert_type = filterType;
      if (filterSeverity) params.severity = filterSeverity;
      if (unreadOnly) params.unread_only = true;
      setAlerts(await fetchAlerts(params));
    } finally {
      setLoading(false);
    }
  }, [filterType, filterSeverity, unreadOnly]);

  useEffect(() => { reload(); }, [reload]);

  const handleMarkRead = async (alertId) => {
    await markAlertRead(alertId);
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_read: true } : a));
    fetchUnreadCount();
  };

  const handleMarkAllRead = async () => {
    const unread = alerts.filter(a => !a.is_read);
    await Promise.all(unread.map(a => markAlertRead(a.id)));
    setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
    fetchUnreadCount();
  };

  const unreadCount = alerts.filter(a => !a.is_read).length;

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> Alerts &amp; Nudges</div>
        <h1>Alerts &amp; Notifications</h1>
        <p>{alerts.length} alerts · {unreadCount} unread</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <select className="fi2" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          <option value="RENEWAL">Renewal</option>
          <option value="UTILISATION">Utilisation</option>
        </select>
        <select className="fi2" value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
          <option value="">All Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="INFO">Info</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} />
          Unread only
        </label>
        <div style={{ flex: 1 }} />
        {unreadCount > 0 && (
          <button className="btn btn-o btn-sm" onClick={handleMarkAllRead}>Mark all as read</button>
        )}
      </div>

      {loading && <div style={{ color: "var(--tx-q)", fontSize: 13 }}>Loading…</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {alerts.map(a => {
          const sc = SEVERITY_COLOR[a.severity] || SEVERITY_COLOR.INFO;
          return (
            <div
              key={a.id}
              style={{
                background: a.is_read ? "var(--surf)" : sc.bg,
                border: `1px solid ${a.is_read ? "var(--bdr)" : sc.border}`,
                borderRadius: 8, padding: "12px 16px",
                opacity: a.is_read ? 0.7 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className={`tag ${sc.badge}`}>{a.severity}</span>
                  <span className="tag tg3">{TYPE_LABEL[a.alert_type] || a.alert_type}</span>
                  {a.is_gxp && <span className="tag tg1">GxP</span>}
                  <strong style={{ fontSize: 13 }}>{a.title}</strong>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, marginLeft: 12 }}>
                  <span style={{ fontSize: 11, color: "var(--tx-q)" }}>
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                  {!a.is_read && (
                    <button className="btn btn-o btn-sm" onClick={() => handleMarkRead(a.id)}>
                      Mark read
                    </button>
                  )}
                </div>
              </div>

              {a.body_json && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--tx-m)", display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {a.body_json.ent_id && <span><strong>ENT:</strong> {a.body_json.ent_id}</span>}
                  {a.body_json.sw_name && <span><strong>SW:</strong> {a.body_json.sw_name}</span>}
                  {a.body_json.end_date && <span><strong>Expires:</strong> {a.body_json.end_date}</span>}
                  {a.body_json.util_pct !== undefined && <span><strong>Util:</strong> {a.body_json.util_pct}%</span>}
                  {a.body_json.entitled !== undefined && <span><strong>Entitled:</strong> {a.body_json.entitled}</span>}
                  {a.body_json.in_use !== undefined && <span><strong>In Use:</strong> {a.body_json.in_use}</span>}
                </div>
              )}
            </div>
          );
        })}
        {!loading && alerts.length === 0 && (
          <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 24, textAlign: "center", color: "var(--tx-q)" }}>
            No alerts. Run reconciliation or wait for the daily scheduler to generate alerts.
          </div>
        )}
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
git add frontend/src/pages/Alerts/AlertsPage.jsx
git commit -m "feat: AlertsPage — card-based alerts with severity colors, mark-read, filters"
```

---

## Task 13: Final verification + commit

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend
pytest -v 2>&1 | tail -10
```

Expected: All 70+ tests pass.

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

Expected: 75+ routes.

- [ ] **Step 4: Final commit**

```bash
git add -A
git status
git commit -m "feat: sub-project 5 complete — Reconciliation engine + Alert generator + APScheduler + UI"
```

---

## Self-Review

**Spec coverage:**
- ✅ `POST /reconciliation/run` — computes entitled/in_use, derives status, calls GPT-4o, writes ReconciliationRun + ReconciliationResult, updates Entitlement.status
- ✅ Status derivation: OVER_DEPLOYED >100%, WATCH >90%, UNDER_UTILISED <30%, OK otherwise; EXPIRED checked via contract.end_date
- ✅ `GET /reconciliation/results` — list of runs (last 20)
- ✅ `GET /reconciliation/results/latest` — latest run + results
- ✅ Alert generator: renewal windows T-90/60/30/15/7/1 with severity mapping
- ✅ Alert generator: utilisation >90% (MEDIUM) and >100% (HIGH)
- ✅ Daily idempotency: `_alert_exists_today` prevents duplicate alerts on same day
- ✅ APScheduler `AsyncIOScheduler` fires daily midnight UTC
- ✅ `GET /alerts` with type/severity/unread_only filters
- ✅ `POST /alerts/{id}/read`
- ✅ `GET /alerts/counts` (total_unread, critical, high, medium, info)
- ✅ alertStore `fetchUnreadCount()` wired to 60s poll in App.jsx
- ✅ TopBar bell dot already reads from `unreadCount` (no change needed to TopBar)
- ✅ ReconciliationPage: run button, util bar, AI recommendations, run history
- ✅ AlertsPage: card layout per severity, mark-read, mark-all-read, filters

**Type consistency:**
- `_compute_recon_status` returns strings matching `recon_status_enum` values (`OVER_DEPLOYED`, `WATCH`, `OK`, `UNDER_UTILISED`) ✅
- `Entitlement.status` uses `entitlement_status_enum` which includes EXPIRED — correctly set in engine ✅
- `ReconResultOut.util_pct` is `float | None`, `ReconciliationResult.util_pct` is `Numeric` (compatible) ✅
- `AlertOut.is_read` is computed, not a DB column — not in `model_validate`, set manually ✅
- `_run_scheduled_alerts` uses `AsyncSessionLocal` (same pattern as `seed()`) ✅
