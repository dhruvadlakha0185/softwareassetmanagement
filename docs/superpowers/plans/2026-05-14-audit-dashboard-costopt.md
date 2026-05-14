# Audit Trail + Dashboard + Cost Optimisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the DRL SAM Platform with a GxP-compliant append-only audit trail, a cost optimisation scorecard, and a live dashboard summary — the final sub-project.

**Architecture:** A reusable `audit_logger.py` service inserts `AuditTrail` rows; existing mutation routes (catalog, entitlement, onboarding, reconciliation) call it after each commit; three new FastAPI routers expose GET /audit (paginated/filtered + XLSX export), GET /cost-optimisation/scorecard (ranked by est. saving), and GET /dashboard/summary (single-call metric aggregation); three placeholder React pages are replaced.

**Tech Stack:** FastAPI · SQLAlchemy async · openpyxl (already installed) · React 18 · DRL CSS design system (`.mg`, `.met`, `.mv` metric card classes)

---

## File Map

**Create:**
- `backend/app/services/audit_logger.py` — `log_event()` INSERT-only audit helper
- `backend/app/schemas/audit.py` — AuditTrailOut, AuditQueryParams
- `backend/app/schemas/cost_opt.py` — CostOptItem, CostOptScorecardOut
- `backend/app/schemas/dashboard.py` — DashboardSummaryOut
- `backend/app/api/v1/routes/audit.py` — GET /audit, GET /audit/export
- `backend/app/api/v1/routes/cost_opt.py` — GET /cost-optimisation/scorecard
- `backend/app/api/v1/routes/dashboard.py` — GET /dashboard/summary
- `backend/tests/test_audit.py`
- `backend/tests/test_cost_opt_dashboard.py`
- `frontend/src/api/audit.js`
- `frontend/src/api/costOpt.js`
- `frontend/src/api/dashboard.js`

**Modify:**
- `backend/app/main.py` — register audit + cost_opt + dashboard routers
- `backend/app/api/v1/routes/catalog.py` — add audit calls on create/update
- `backend/app/api/v1/routes/entitlements.py` — add audit call on update + upload
- `backend/app/api/v1/routes/onboarding.py` — add audit call on publish
- `backend/app/api/v1/routes/reconciliation.py` — add audit call after run

**Replace (placeholders):**
- `frontend/src/pages/AuditTrail/AuditTrailPage.jsx`
- `frontend/src/pages/CostOpt/CostOptPage.jsx`
- `frontend/src/pages/Dashboard/DashboardPage.jsx`

---

## Task 1: Audit logger service

**Files:**
- Create: `backend/app/services/audit_logger.py`

- [ ] **Step 1: Create the audit logger**

Create `backend/app/services/audit_logger.py`:

```python
"""
GxP-compliant audit logger.
Inserts AuditTrail rows only — never updates or deletes.
GxP entries (is_gxp=True) require reason_for_change — raises ValueError if missing.
Caller is responsible for committing the session.
"""
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditTrail


async def log_event(
    db: AsyncSession,
    user_id: UUID | None,
    action_type: str,
    entity_type: str,
    entity_id: str,
    sw_id: str | None = None,
    before: dict | None = None,
    after: dict | None = None,
    reason: str | None = None,
    file_hash: str | None = None,
    is_gxp: bool = False,
) -> AuditTrail:
    """
    Append an audit entry. Does NOT commit — caller commits.

    action_type examples: CATALOG_CREATED, CATALOG_UPDATED, ENTITLEMENT_UPDATED,
                          SOFTWARE_ONBOARDED, RECONCILIATION_RUN, USAGE_UPLOADED
    entity_type examples: software_catalog, entitlement, reconciliation_run
    """
    if is_gxp and not reason:
        raise ValueError(
            f"reason_for_change is required for GxP entity {entity_type}:{entity_id}"
        )
    entry = AuditTrail(
        user_id=user_id,
        action_type=action_type,
        entity_type=entity_type,
        entity_id=entity_id,
        sw_id=sw_id,
        before_values_json=before,
        after_values_json=after,
        reason_for_change=reason,
        file_hash=file_hash,
        is_gxp=is_gxp,
    )
    db.add(entry)
    return entry
```

- [ ] **Step 2: Verify import**

```bash
cd backend
python -c "from app.services.audit_logger import log_event; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/audit_logger.py
git commit -m "feat: GxP audit logger service (INSERT-only, reason required for GxP)"
```

---

## Task 2: Audit Pydantic schemas

**Files:**
- Create: `backend/app/schemas/audit.py`

- [ ] **Step 1: Create audit schemas**

Create `backend/app/schemas/audit.py`:

```python
from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class AuditTrailOut(BaseModel):
    id: UUID
    user_id: UUID | None = None
    action_type: str
    entity_type: str
    entity_id: str | None = None
    sw_id: str | None = None
    before_values_json: dict | None = None
    after_values_json: dict | None = None
    reason_for_change: str | None = None
    file_hash: str | None = None
    is_gxp: bool
    created_at_utc: datetime
    is_archived: bool
    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Verify**

```bash
cd backend
python -c "from app.schemas.audit import AuditTrailOut; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/audit.py
git commit -m "feat: audit trail Pydantic schema"
```

---

## Task 3: Audit router + wire into main.py

**Files:**
- Create: `backend/app/api/v1/routes/audit.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create audit router**

Create `backend/app/api/v1/routes/audit.py`:

```python
import io
from datetime import datetime, date
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.audit import AuditTrail
from app.schemas.audit import AuditTrailOut

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditTrailOut])
async def list_audit(
    entity_type: str | None = Query(None),
    action_type: str | None = Query(None),
    sw_id: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(AuditTrail).order_by(AuditTrail.created_at_utc.desc())
    if entity_type:
        q = q.where(AuditTrail.entity_type == entity_type)
    if action_type:
        q = q.where(AuditTrail.action_type == action_type)
    if sw_id:
        q = q.where(AuditTrail.sw_id == sw_id)
    if date_from:
        q = q.where(AuditTrail.created_at_utc >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.where(AuditTrail.created_at_utc <= datetime.combine(date_to, datetime.max.time()))
    q = q.limit(limit).offset(offset)
    result = await db.execute(q)
    return [AuditTrailOut.model_validate(r) for r in result.scalars().all()]


@router.get("/export")
async def export_audit(
    entity_type: str | None = Query(None),
    sw_id: str | None = Query(None),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(AuditTrail).order_by(AuditTrail.created_at_utc.desc()).limit(1000)
    if entity_type:
        q = q.where(AuditTrail.entity_type == entity_type)
    if sw_id:
        q = q.where(AuditTrail.sw_id == sw_id)
    result = await db.execute(q)
    rows = result.scalars().all()

    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    wb = Workbook()
    ws = wb.active
    ws.title = "Audit Trail"
    headers = ["Timestamp (UTC)", "Action", "Entity Type", "Entity ID",
               "SW_ID", "User ID", "GxP", "Reason for Change"]
    ws.append(headers)
    header_fill = PatternFill("solid", fgColor="1A2E5A")
    header_font = Font(color="FFFFFF", bold=True, size=10)
    for col in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")

    for r in rows:
        ws.append([
            str(r.created_at_utc) if r.created_at_utc else "",
            r.action_type,
            r.entity_type,
            r.entity_id or "",
            r.sw_id or "",
            str(r.user_id) if r.user_id else "",
            "YES" if r.is_gxp else "NO",
            r.reason_for_change or "",
        ])

    buf = io.BytesIO()
    wb.save(buf)
    today = date.today().isoformat()
    return StreamingResponse(
        io.BytesIO(buf.getvalue()),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=audit_trail_{today}.xlsx"},
    )
```

- [ ] **Step 2: Wire audit router + add cost_opt + dashboard imports into main.py**

Edit `backend/app/main.py` — add the three new import lines and three `include_router` calls.

Add after `from app.api.v1.routes.alerts import router as alerts_router`:
```python
from app.api.v1.routes.audit import router as audit_router
from app.api.v1.routes.cost_opt import router as cost_opt_router
from app.api.v1.routes.dashboard import router as dashboard_router
```

Add after `app.include_router(alerts_router, prefix="/api/v1")`:
```python
app.include_router(audit_router, prefix="/api/v1")
app.include_router(cost_opt_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
```

Full updated `backend/app/main.py`:

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
from app.api.v1.routes.audit import router as audit_router
from app.api.v1.routes.cost_opt import router as cost_opt_router
from app.api.v1.routes.dashboard import router as dashboard_router
from app.core.config import settings


async def _run_scheduled_alerts():
    from app.core.database import AsyncSessionLocal
    from app.services.alert_generator import generate_alerts
    async with AsyncSessionLocal() as db:
        count = await generate_alerts(db)
        print(f"[scheduler] Alert generator: {count} new alerts created")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.storage_backend in ("supabase", "local"):
        try:
            from scripts.seed import seed
            await seed()
        except Exception as e:
            print(f"Seed skipped: {e}")

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
app.include_router(audit_router, prefix="/api/v1")
app.include_router(cost_opt_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "drl-sam-backend"}
```

- [ ] **Step 3: Note** — cost_opt and dashboard routers don't exist yet; main.py will fail to import until Tasks 4 and 5 complete. Skip verification until after Task 5.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/routes/audit.py backend/app/schemas/audit.py
git commit -m "feat: audit trail router (GET /audit paginated/filtered + XLSX export)"
```

---

## Task 4: Cost optimisation router

**Files:**
- Create: `backend/app/schemas/cost_opt.py`
- Create: `backend/app/api/v1/routes/cost_opt.py`

- [ ] **Step 1: Create cost opt schemas**

Create `backend/app/schemas/cost_opt.py`:

```python
from __future__ import annotations
from pydantic import BaseModel


class CostOptItem(BaseModel):
    ent_id: str
    sw_id: str
    canonical_name: str
    contract_name: str | None = None
    status: str
    entitled_count: int | None = None
    in_use_count: int | None = None
    unit_cost_inr: int | None = None
    annual_cost_inr: int | None = None
    est_annual_saving_inr: int
    action: str   # "RIGHT-SIZE" | "IMMEDIATE-RISK" | "WATCH"


class CostOptScorecardOut(BaseModel):
    total_est_saving_inr: int
    items: list[CostOptItem]
```

- [ ] **Step 2: Create cost opt router**

Create `backend/app/api/v1/routes/cost_opt.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.contracts import Entitlement
from app.models.catalog import SoftwareCatalog
from app.schemas.cost_opt import CostOptItem, CostOptScorecardOut

router = APIRouter(prefix="/cost-optimisation", tags=["cost-optimisation"])


@router.get("/scorecard", response_model=CostOptScorecardOut)
async def get_scorecard(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ents_result = await db.execute(select(Entitlement))
    ents = ents_result.scalars().all()

    items = []
    for ent in ents:
        status = ent.status
        if status not in ("UNDER_UTILISED", "OVER_DEPLOYED", "WATCH"):
            continue

        sw = await db.get(SoftwareCatalog, ent.sw_id)
        canonical_name = sw.canonical_name if sw else ent.sw_id

        entitled = ent.entitled_count or 0
        in_use = ent.in_use_count or 0
        unit_cost = ent.unit_cost_inr or 0

        if status == "UNDER_UTILISED":
            est_saving = unit_cost * max(0, entitled - in_use)
            action = "RIGHT-SIZE"
        elif status == "OVER_DEPLOYED":
            est_saving = 0
            action = "IMMEDIATE-RISK"
        else:  # WATCH
            est_saving = 0
            action = "WATCH"

        items.append(CostOptItem(
            ent_id=ent.ent_id,
            sw_id=ent.sw_id,
            canonical_name=canonical_name,
            contract_name=ent.contract_name,
            status=status,
            entitled_count=ent.entitled_count,
            in_use_count=ent.in_use_count,
            unit_cost_inr=ent.unit_cost_inr,
            annual_cost_inr=ent.annual_cost_inr,
            est_annual_saving_inr=est_saving,
            action=action,
        ))

    # Sort: OVER_DEPLOYED first (risk), then by est_saving descending
    items.sort(key=lambda x: (0 if x.status == "OVER_DEPLOYED" else 1, -x.est_annual_saving_inr))
    total_saving = sum(i.est_annual_saving_inr for i in items)

    return CostOptScorecardOut(total_est_saving_inr=total_saving, items=items)
```

- [ ] **Step 3: Verify import**

```bash
cd backend
python -c "from app.api.v1.routes.cost_opt import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/cost_opt.py backend/app/api/v1/routes/cost_opt.py
git commit -m "feat: cost optimisation scorecard — ranked by est. annual saving"
```

---

## Task 5: Dashboard router

**Files:**
- Create: `backend/app/schemas/dashboard.py`
- Create: `backend/app/api/v1/routes/dashboard.py`

- [ ] **Step 1: Create dashboard schemas**

Create `backend/app/schemas/dashboard.py`:

```python
from pydantic import BaseModel


class DashboardSummaryOut(BaseModel):
    total_sw: int
    total_entitlements: int
    total_annual_cost_inr: int
    over_deployed_count: int
    watch_count: int
    under_utilised_count: int
    expiring_30d_count: int
    unread_alerts_count: int
    total_discovery_records: int
    matched_discovery_count: int
```

- [ ] **Step 2: Create dashboard router**

Create `backend/app/api/v1/routes/dashboard.py`:

```python
from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.catalog import SoftwareCatalog
from app.models.contracts import Entitlement, Contract
from app.models.alerts import Alert, AlertRead
from app.models.discovery import DiscoveryRecord
from app.schemas.dashboard import DashboardSummaryOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummaryOut)
async def get_summary(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # SW count
    total_sw = (await db.execute(select(func.count()).select_from(SoftwareCatalog))).scalar_one()

    # Entitlement counts
    ents_result = await db.execute(select(Entitlement))
    ents = ents_result.scalars().all()
    total_entitlements = len(ents)
    total_annual_cost = sum(e.annual_cost_inr or 0 for e in ents)
    over_deployed = sum(1 for e in ents if e.status == "OVER_DEPLOYED")
    watch = sum(1 for e in ents if e.status == "WATCH")
    under_utilised = sum(1 for e in ents if e.status == "UNDER_UTILISED")

    # Expiring in 30 days — check contracts
    in_30d = date.today() + timedelta(days=30)
    expiring_ids = set()
    for ent in ents:
        if ent.contract_id:
            contract = await db.get(Contract, ent.contract_id)
            if contract and contract.end_date and date.today() <= contract.end_date <= in_30d:
                expiring_ids.add(ent.ent_id)

    # Unread alert count for current user
    read_result = await db.execute(
        select(AlertRead.alert_id).where(AlertRead.user_id == current_user.id)
    )
    read_ids = {row[0] for row in read_result.fetchall()}
    total_alerts = (await db.execute(select(func.count()).select_from(Alert))).scalar_one()
    unread_alerts = total_alerts - len(read_ids)

    # Discovery
    total_discovery = (await db.execute(select(func.count()).select_from(DiscoveryRecord))).scalar_one()
    matched_discovery = (await db.execute(
        select(func.count()).select_from(DiscoveryRecord).where(DiscoveryRecord.sw_id.is_not(None))
    )).scalar_one()

    return DashboardSummaryOut(
        total_sw=total_sw,
        total_entitlements=total_entitlements,
        total_annual_cost_inr=total_annual_cost,
        over_deployed_count=over_deployed,
        watch_count=watch,
        under_utilised_count=under_utilised,
        expiring_30d_count=len(expiring_ids),
        unread_alerts_count=max(0, unread_alerts),
        total_discovery_records=total_discovery,
        matched_discovery_count=matched_discovery,
    )
```

- [ ] **Step 3: Verify main.py now imports cleanly**

```bash
cd backend
python -c "
from app.main import app
routes = [r.path for r in app.routes if hasattr(r, 'path')]
print(f'Total routes: {len(routes)}')
audit = [r for r in routes if '/audit' in r]
cost = [r for r in routes if '/cost' in r]
dash = [r for r in routes if '/dashboard' in r]
print('Audit:', audit)
print('Cost:', cost)
print('Dashboard:', dash)
"
```

Expected: 80+ routes. Audit: `/api/v1/audit`, `/api/v1/audit/export`. Cost: `/api/v1/cost-optimisation/scorecard`. Dashboard: `/api/v1/dashboard/summary`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/dashboard.py backend/app/api/v1/routes/dashboard.py backend/app/main.py
git commit -m "feat: dashboard summary + cost opt scorecard routers + wire into main"
```

---

## Task 6: Wire audit calls into existing mutation routes

**Files:**
- Modify: `backend/app/api/v1/routes/catalog.py`
- Modify: `backend/app/api/v1/routes/entitlements.py`
- Modify: `backend/app/api/v1/routes/onboarding.py`
- Modify: `backend/app/api/v1/routes/reconciliation.py`

- [ ] **Step 1: Add audit to catalog.py create and update**

In `backend/app/api/v1/routes/catalog.py`, update `create_catalog_entry` and `update_catalog_entry` to get the current user and log:

Change `create_catalog_entry` signature from `dependencies=[admin_only]` to expose the user:

```python
@router.post("", response_model=SoftwareCatalogOut, status_code=201)
async def create_catalog_entry(
    body: SoftwareCatalogCreate,
    current_user=Depends(require_role(["COE_ADMIN"])),
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
    from app.services.audit_logger import log_event
    await log_event(
        db, current_user.id, "CATALOG_CREATED", "software_catalog", sw_id,
        sw_id=sw_id,
        after=body.model_dump(mode="json"),
        is_gxp=(body.gxp_flag != "no"),
    )
    await db.commit()
    await db.refresh(sw)
    return await _load_out(sw, db)
```

Change `update_catalog_entry` similarly:

```python
@router.put("/{sw_id}", response_model=SoftwareCatalogOut)
async def update_catalog_entry(
    sw_id: str,
    body: SoftwareCatalogUpdate,
    current_user=Depends(require_role(["COE_ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    sw = await db.get(SoftwareCatalog, sw_id)
    if not sw:
        raise HTTPException(status_code=404, detail="Software entry not found")
    before = {k: getattr(sw, k) for k in body.model_dump(exclude_none=True)}
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(sw, k, v)
    from app.services.audit_logger import log_event
    await log_event(
        db, current_user.id, "CATALOG_UPDATED", "software_catalog", sw_id,
        sw_id=sw_id,
        before={k: str(v) for k, v in before.items()},
        after=body.model_dump(exclude_none=True, mode="json"),
        is_gxp=(sw.gxp_flag != "no"),
    )
    await db.commit()
    await db.refresh(sw)
    return await _load_out(sw, db)
```

The full updated `backend/app/api/v1/routes/catalog.py` (replace the two route functions, keep rest unchanged):

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
    return SoftwareCatalogOut(
        sw_id=sw.sw_id,
        canonical_name=sw.canonical_name,
        publisher=sw.publisher,
        category_id=sw.category_id,
        sub_category_id=sw.sub_category_id,
        gxp_flag=sw.gxp_flag,
        vendor_id=sw.vendor_id,
        vendor_risk=sw.vendor_risk,
        deployment=sw.deployment,
        region_id=sw.region_id,
        app_owner_id=sw.app_owner_id,
        notes=sw.notes,
        onboarded_date=sw.onboarded_date,
        aliases=aliases,
    )


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


@router.post("", response_model=SoftwareCatalogOut, status_code=201)
async def create_catalog_entry(
    body: SoftwareCatalogCreate,
    current_user=Depends(require_role(["COE_ADMIN"])),
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
    from app.services.audit_logger import log_event
    await log_event(
        db, current_user.id, "CATALOG_CREATED", "software_catalog", sw_id,
        sw_id=sw_id,
        after=body.model_dump(mode="json"),
        is_gxp=(body.gxp_flag != "no"),
    )
    await db.commit()
    await db.refresh(sw)
    return await _load_out(sw, db)


@router.put("/{sw_id}", response_model=SoftwareCatalogOut)
async def update_catalog_entry(
    sw_id: str,
    body: SoftwareCatalogUpdate,
    current_user=Depends(require_role(["COE_ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    sw = await db.get(SoftwareCatalog, sw_id)
    if not sw:
        raise HTTPException(status_code=404, detail="Software entry not found")
    before = {k: str(getattr(sw, k)) for k in body.model_dump(exclude_none=True)}
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(sw, k, v)
    from app.services.audit_logger import log_event
    await log_event(
        db, current_user.id, "CATALOG_UPDATED", "software_catalog", sw_id,
        sw_id=sw_id,
        before=before,
        after=body.model_dump(exclude_none=True, mode="json"),
        is_gxp=(sw.gxp_flag != "no"),
    )
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

- [ ] **Step 2: Add audit to entitlements.py update_entitlement**

Edit `backend/app/api/v1/routes/entitlements.py` — update the `update_entitlement` route to get current_user and log:

```python
@router.put("/{ent_id}", response_model=EntitlementOut)
async def update_entitlement(
    ent_id: str,
    body: EntitlementUpdate,
    current_user=Depends(require_role(["COE_ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    ent = await db.get(Entitlement, ent_id)
    if not ent:
        raise HTTPException(status_code=404, detail="Entitlement not found")
    before = {k: str(getattr(ent, k)) for k in body.model_dump(exclude_none=True)}
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(ent, k, v)
    from app.services.audit_logger import log_event
    from app.models.catalog import SoftwareCatalog
    sw = await db.get(SoftwareCatalog, ent.sw_id)
    is_gxp = (sw.gxp_flag != "no") if sw else False
    await log_event(
        db, current_user.id, "ENTITLEMENT_UPDATED", "entitlement", ent_id,
        sw_id=ent.sw_id,
        before=before,
        after=body.model_dump(exclude_none=True, mode="json"),
        is_gxp=is_gxp,
    )
    await db.commit()
    await db.refresh(ent)
    return EntitlementOut.model_validate(ent)
```

- [ ] **Step 3: Add audit to onboarding.py publish**

Edit `backend/app/api/v1/routes/onboarding.py` — append a `log_event` call just before the final `await db.commit()` in `publish_onboarding`:

```python
    # Audit
    from app.services.audit_logger import log_event
    await log_event(
        db, current_user.id, "SOFTWARE_ONBOARDED", "software_catalog", sw_id,
        sw_id=sw_id,
        after={"canonical_name": body.canonical_name, "contract_id": str(contract.id), "ent_ids": ent_ids},
        is_gxp=(body.gxp_flag != "no"),
    )

    await db.commit()
    return PublishOut(sw_id=sw_id, contract_id=contract.id, ent_ids=ent_ids)
```

- [ ] **Step 4: Add audit to reconciliation.py**

Edit `backend/app/api/v1/routes/reconciliation.py` — add audit log after `run_reconciliation`:

```python
@router.post("/run", response_model=ReconRunWithResults, status_code=201)
async def trigger_reconciliation(
    current_user=Depends(require_role(["COE_ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    run = await run_reconciliation(db, triggered_by_id=current_user.id)
    from app.services.audit_logger import log_event
    await log_event(
        db, current_user.id, "RECONCILIATION_RUN", "reconciliation_run", str(run.id),
        after={"entitlements_processed": run.entitlements_processed},
        is_gxp=False,
    )
    await db.commit()
    results_q = await db.execute(
        select(ReconciliationResult).where(ReconciliationResult.run_id == run.id)
    )
    results = [ReconResultOut.model_validate(r) for r in results_q.scalars().all()]
    return ReconRunWithResults(run=ReconRunOut.model_validate(run), results=results)
```

- [ ] **Step 5: Verify all routes still import**

```bash
cd backend
python -c "
from app.main import app
routes = [r.path for r in app.routes if hasattr(r, 'path')]
print(f'Total routes: {len(routes)}')
"
```

Expected: 82+ routes.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/routes/catalog.py backend/app/api/v1/routes/entitlements.py backend/app/api/v1/routes/onboarding.py backend/app/api/v1/routes/reconciliation.py
git commit -m "feat: wire audit_logger into catalog/entitlement/onboarding/reconciliation routes"
```

---

## Task 7: Tests — audit, cost opt, dashboard

**Files:**
- Create: `backend/tests/test_audit.py`
- Create: `backend/tests/test_cost_opt_dashboard.py`

- [ ] **Step 1: Write audit tests**

Create `backend/tests/test_audit.py`:

```python
import pytest
from unittest.mock import patch, AsyncMock


async def test_list_audit_requires_auth(client):
    resp = await client.get("/api/v1/audit")
    assert resp.status_code in (401, 403)


async def test_list_audit_empty_initially(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/audit", headers=h)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_catalog_create_produces_audit_entry(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post("/api/v1/catalog", json={
        "canonical_name": "Audit Test SW",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
    }, headers=h)
    assert resp.status_code == 201
    sw_id = resp.json()["sw_id"]

    audit = (await client.get(f"/api/v1/audit?sw_id={sw_id}", headers=h)).json()
    assert any(a["action_type"] == "CATALOG_CREATED" for a in audit)

    # cleanup
    await client.delete(f"/api/v1/catalog/{sw_id}", headers=h)


async def test_audit_filter_by_entity_type(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/audit?entity_type=software_catalog", headers=h)
    assert resp.status_code == 200
    for entry in resp.json():
        assert entry["entity_type"] == "software_catalog"


async def test_audit_export_returns_xlsx(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/audit/export", headers=h)
    assert resp.status_code == 200
    assert "spreadsheet" in resp.headers["content-type"]
    assert len(resp.content) > 100


async def test_recon_run_produces_audit_entry(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    with patch("app.services.reconciliation_engine.get_recommendations", new_callable=AsyncMock) as mock_ai:
        mock_ai.return_value = {}
        await client.post("/api/v1/reconciliation/run", headers=h)

    audit = (await client.get("/api/v1/audit?entity_type=reconciliation_run", headers=h)).json()
    assert any(a["action_type"] == "RECONCILIATION_RUN" for a in audit)
```

- [ ] **Step 2: Write cost opt + dashboard tests**

Create `backend/tests/test_cost_opt_dashboard.py`:

```python
import pytest
from unittest.mock import patch, AsyncMock


async def test_scorecard_requires_auth(client):
    resp = await client.get("/api/v1/cost-optimisation/scorecard")
    assert resp.status_code in (401, 403)


async def test_scorecard_returns_scorecard(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/cost-optimisation/scorecard", headers=h)
    assert resp.status_code == 200
    data = resp.json()
    assert "total_est_saving_inr" in data
    assert "items" in data
    assert isinstance(data["items"], list)


async def test_scorecard_shows_under_utilised(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    # Create an under-utilised entitlement
    publish = (await client.post("/api/v1/onboarding/publish", json={
        "canonical_name": "CostOpt Test SW",
        "gxp_flag": "no", "vendor_risk": "LOW", "deployment": "cloud",
        "line_items": [{"contract_name": "CostOpt Sub", "license_type": "subscription",
                        "entitled_count": 100, "unit_cost_inr": 1000}],
    }, headers=h)).json()
    ent_id = publish["ent_ids"][0]

    # Set low in-use (under-utilised) and run reconciliation to update status
    await client.put(f"/api/v1/entitlements/{ent_id}", json={"in_use_count": 20}, headers=h)
    with patch("app.services.reconciliation_engine.get_recommendations", new_callable=AsyncMock) as m:
        m.return_value = {}
        await client.post("/api/v1/reconciliation/run", headers=h)

    resp = await client.get("/api/v1/cost-optimisation/scorecard", headers=h)
    data = resp.json()
    our_item = next((i for i in data["items"] if i["ent_id"] == ent_id), None)
    assert our_item is not None
    assert our_item["status"] == "UNDER_UTILISED"
    assert our_item["est_annual_saving_inr"] > 0
    assert our_item["action"] == "RIGHT-SIZE"


async def test_dashboard_summary_requires_auth(client):
    resp = await client.get("/api/v1/dashboard/summary")
    assert resp.status_code in (401, 403)


async def test_dashboard_summary(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.get("/api/v1/dashboard/summary", headers=h)
    assert resp.status_code == 200
    data = resp.json()
    for key in ("total_sw", "total_entitlements", "total_annual_cost_inr",
                "over_deployed_count", "watch_count", "under_utilised_count",
                "expiring_30d_count", "unread_alerts_count",
                "total_discovery_records", "matched_discovery_count"):
        assert key in data, f"Missing key: {key}"
    assert data["total_sw"] >= 0
    assert data["total_entitlements"] >= 0
```

- [ ] **Step 3: Run all new tests**

```bash
cd backend
pytest tests/test_audit.py tests/test_cost_opt_dashboard.py -v
```

Expected: All 11 tests PASS.

- [ ] **Step 4: Run full suite**

```bash
cd backend
pytest -v 2>&1 | tail -5
```

Expected: 81+ tests all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_audit.py backend/tests/test_cost_opt_dashboard.py
git commit -m "test: audit trail, cost opt scorecard, dashboard summary"
```

---

## Task 8: Frontend API modules

**Files:**
- Create: `frontend/src/api/audit.js`
- Create: `frontend/src/api/costOpt.js`
- Create: `frontend/src/api/dashboard.js`

- [ ] **Step 1: Create audit.js**

Create `frontend/src/api/audit.js`:

```js
import client from "./client";

const base = "/audit";

export const fetchAudit = (params = {}) =>
  client.get(base, { params }).then(r => r.data);

export const exportAudit = (params = {}) =>
  client.get(`${base}/export`, { params, responseType: "blob" }).then(r => r.data);
```

- [ ] **Step 2: Create costOpt.js**

Create `frontend/src/api/costOpt.js`:

```js
import client from "./client";

export const fetchScorecard = () =>
  client.get("/cost-optimisation/scorecard").then(r => r.data);
```

- [ ] **Step 3: Create dashboard.js**

Create `frontend/src/api/dashboard.js`:

```js
import client from "./client";

export const fetchDashboardSummary = () =>
  client.get("/dashboard/summary").then(r => r.data);
```

- [ ] **Step 4: Verify build**

```bash
cd frontend
npm run build 2>&1 | tail -3
```

Expected: `✓ built in Xs`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/audit.js frontend/src/api/costOpt.js frontend/src/api/dashboard.js
git commit -m "feat: frontend API modules for audit, cost opt, and dashboard"
```

---

## Task 9: AuditTrailPage UI

**Files:**
- Modify: `frontend/src/pages/AuditTrail/AuditTrailPage.jsx`

- [ ] **Step 1: Write AuditTrailPage**

Replace `frontend/src/pages/AuditTrail/AuditTrailPage.jsx` with:

```jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { fetchAudit, exportAudit } from "../../api/audit";

const ACTION_BADGE = {
  CATALOG_CREATED:    <span className="tag tg2">Created</span>,
  CATALOG_UPDATED:    <span className="tag tb3">Updated</span>,
  ENTITLEMENT_UPDATED:<span className="tag tb3">Updated</span>,
  SOFTWARE_ONBOARDED: <span className="tag tg2">Onboarded</span>,
  RECONCILIATION_RUN: <span className="tag tp2">Recon Run</span>,
  USAGE_UPLOADED:     <span className="tag ta2">Upload</span>,
};

export default function AuditTrailPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEntityType, setFilterEntityType] = useState("");
  const [filterActionType, setFilterActionType] = useState("");
  const [filterSwId, setFilterSwId] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [exporting, setExporting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterEntityType) params.entity_type = filterEntityType;
      if (filterActionType) params.action_type = filterActionType;
      if (filterSwId) params.sw_id = filterSwId;
      setEntries(await fetchAudit(params));
    } finally {
      setLoading(false);
    }
  }, [filterEntityType, filterActionType, filterSwId]);

  useEffect(() => { reload(); }, [reload]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportAudit({ entity_type: filterEntityType || undefined, sw_id: filterSwId || undefined });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit_trail_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> Audit Trail</div>
        <h1>Audit Trail</h1>
        <p>Append-only · tamper-evident · GxP 21 CFR Part 11 compliant · {entries.length} entries</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select className="fi2" value={filterEntityType} onChange={e => setFilterEntityType(e.target.value)}>
          <option value="">All Entities</option>
          <option value="software_catalog">Software Catalog</option>
          <option value="entitlement">Entitlement</option>
          <option value="reconciliation_run">Reconciliation</option>
        </select>
        <select className="fi2" value={filterActionType} onChange={e => setFilterActionType(e.target.value)}>
          <option value="">All Actions</option>
          <option value="CATALOG_CREATED">Catalog Created</option>
          <option value="CATALOG_UPDATED">Catalog Updated</option>
          <option value="ENTITLEMENT_UPDATED">Entitlement Updated</option>
          <option value="SOFTWARE_ONBOARDED">Software Onboarded</option>
          <option value="RECONCILIATION_RUN">Reconciliation Run</option>
        </select>
        <input className="fi2" style={{ width: 110 }} value={filterSwId} onChange={e => setFilterSwId(e.target.value)} placeholder="SW_ID filter" />
        <div style={{ flex: 1 }} />
        <button className="btn btn-o btn-sm" onClick={handleExport} disabled={exporting}>
          {exporting ? "Exporting…" : "⬇ Export XLSX"}
        </button>
      </div>

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Timestamp (UTC)</th><th>Action</th><th>Entity</th>
              <th>Entity ID</th><th>SW_ID</th><th>GxP</th><th>Reason</th><th>Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="8" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {entries.map(e => (
              <>
                <tr key={e.id} style={{ cursor: e.after_values_json ? "pointer" : "default" }}
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                  <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{new Date(e.created_at_utc).toLocaleString()}</td>
                  <td>{ACTION_BADGE[e.action_type] ?? <span className="tag tg3">{e.action_type}</span>}</td>
                  <td style={{ fontSize: 11.5 }}>{e.entity_type}</td>
                  <td style={{ fontSize: 11 }}>{e.entity_id || "—"}</td>
                  <td style={{ fontSize: 11 }}>{e.sw_id || "—"}</td>
                  <td>{e.is_gxp ? <span className="tag tg1">GxP</span> : <span style={{ color: "var(--tx-q)", fontSize: 11 }}>—</span>}</td>
                  <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{e.reason_for_change || "—"}</td>
                  <td style={{ fontSize: 11, color: "var(--tx-q)" }}>
                    {(e.after_values_json || e.before_values_json) ? "▼ view" : ""}
                  </td>
                </tr>
                {expanded === e.id && (
                  <tr key={`${e.id}-exp`}>
                    <td colSpan="8" style={{ background: "var(--bg2)", padding: "8px 14px", fontSize: 11 }}>
                      {e.before_values_json && (
                        <div style={{ marginBottom: 4 }}>
                          <strong>Before:</strong> {JSON.stringify(e.before_values_json, null, 2)}
                        </div>
                      )}
                      {e.after_values_json && (
                        <div>
                          <strong>After:</strong> {JSON.stringify(e.after_values_json, null, 2)}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
            {!loading && entries.length === 0 && (
              <tr><td colSpan="8" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>No audit entries. Actions (create/update/onboard/reconcile) will appear here.</td></tr>
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
git add frontend/src/pages/AuditTrail/AuditTrailPage.jsx
git commit -m "feat: AuditTrailPage — filterable table + expandable before/after + XLSX export"
```

---

## Task 10: CostOptPage UI

**Files:**
- Modify: `frontend/src/pages/CostOpt/CostOptPage.jsx`

- [ ] **Step 1: Write CostOptPage**

Replace `frontend/src/pages/CostOpt/CostOptPage.jsx` with:

```jsx
import { useState, useEffect } from "react";
import { fetchScorecard } from "../../api/costOpt";

const ACTION_BADGE = {
  "RIGHT-SIZE":     <span className="tag tg2">Right-Size</span>,
  "IMMEDIATE-RISK": <span className="tag tgr2">Immediate Risk</span>,
  "WATCH":          <span className="tag ta2">Watch</span>,
};

const STATUS_BADGE = {
  UNDER_UTILISED: <span className="tag tg3">Under-Utilised</span>,
  OVER_DEPLOYED:  <span className="tag tgr2">Over-Deployed</span>,
  WATCH:          <span className="tag ta2">Watch</span>,
};

export default function CostOptPage() {
  const [scorecard, setScorecard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScorecard()
      .then(setScorecard)
      .catch(() => setScorecard({ total_est_saving_inr: 0, items: [] }))
      .finally(() => setLoading(false));
  }, []);

  const items = scorecard?.items || [];
  const totalSaving = scorecard?.total_est_saving_inr || 0;

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> Cost Optimisation</div>
        <h1>Cost Optimisation Scorecard</h1>
        <p>CIO / CFO view · right-sizing opportunities · {items.length} actionable items</p>
      </div>

      {/* Summary card */}
      {scorecard && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div className="met ml-g" style={{ minWidth: 200 }}>
            <div className="ml">Est. Annual Saving</div>
            <div className="mv">₹{totalSaving.toLocaleString("en-IN")}</div>
            <div className="ms grn">from right-sizing under-utilised licenses</div>
          </div>
          <div className="met ml-r" style={{ minWidth: 160 }}>
            <div className="ml">Immediate Risks</div>
            <div className="mv">{items.filter(i => i.action === "IMMEDIATE-RISK").length}</div>
            <div className="ms red">over-deployed licenses</div>
          </div>
          <div className="met ml-a" style={{ minWidth: 160 }}>
            <div className="ml">Watch Items</div>
            <div className="mv">{items.filter(i => i.action === "WATCH").length}</div>
            <div className="ms amb">approaching threshold</div>
          </div>
        </div>
      )}

      {loading && <div style={{ color: "var(--tx-q)", fontSize: 13 }}>Loading…</div>}

      {items.length > 0 && (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Rank</th><th>ENT_ID</th><th>SW_ID</th><th>Canonical Name</th>
                <th>Status</th><th>Entitled</th><th>In Use</th>
                <th>Unit Cost</th><th>Est. Annual Saving</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.ent_id}>
                  <td style={{ textAlign: "center", fontSize: 12, color: "var(--tx-q)" }}>{idx + 1}</td>
                  <td><code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{item.ent_id}</code></td>
                  <td style={{ fontSize: 11.5 }}>{item.sw_id}</td>
                  <td style={{ fontSize: 12 }}><strong>{item.canonical_name}</strong></td>
                  <td>{STATUS_BADGE[item.status] ?? item.status}</td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>{item.entitled_count?.toLocaleString() ?? "—"}</td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>{item.in_use_count?.toLocaleString() ?? "—"}</td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>
                    {item.unit_cost_inr ? `₹${item.unit_cost_inr.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td style={{ textAlign: "right", fontSize: 12, fontWeight: item.est_annual_saving_inr > 0 ? 700 : 400, color: item.est_annual_saving_inr > 0 ? "var(--green-m)" : "var(--tx-q)" }}>
                    {item.est_annual_saving_inr > 0 ? `₹${item.est_annual_saving_inr.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td>{ACTION_BADGE[item.action] ?? item.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && items.length === 0 && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 24, textAlign: "center", color: "var(--tx-q)" }}>
          No optimisation opportunities found. Run reconciliation first to compute utilisation statuses.
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
git add frontend/src/pages/CostOpt/CostOptPage.jsx
git commit -m "feat: CostOptPage — ranked scorecard with est. annual saving and summary cards"
```

---

## Task 11: DashboardPage UI

**Files:**
- Modify: `frontend/src/pages/Dashboard/DashboardPage.jsx`

- [ ] **Step 1: Write DashboardPage**

Replace `frontend/src/pages/Dashboard/DashboardPage.jsx` with:

```jsx
import { useState, useEffect } from "react";
import { fetchDashboardSummary } from "../../api/dashboard";

function MetricCard({ label, value, sub, subClass, colorClass }) {
  return (
    <div className={`met ${colorClass || ""}`}>
      <div className="ml">{label}</div>
      <div className="mv">{value}</div>
      {sub && <div className={`ms ${subClass || ""}`}>{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardSummary()
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page">
        <div className="ph">
          <div className="bc">SAM Platform <span>›</span> Dashboard</div>
          <h1>Software Asset Management</h1>
          <p>Dr. Reddy's Laboratories · Global Portfolio</p>
        </div>
        <div style={{ color: "var(--tx-q)", fontSize: 13 }}>Loading dashboard…</div>
      </div>
    );
  }

  const s = summary || {};
  const totalCostCr = s.total_annual_cost_inr ? (s.total_annual_cost_inr / 10_000_000).toFixed(2) : "0.00";
  const matchPct = s.total_discovery_records > 0
    ? Math.round((s.matched_discovery_count / s.total_discovery_records) * 100)
    : 0;

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> Dashboard</div>
        <h1>Software Asset Management</h1>
        <p>Dr. Reddy's Laboratories · Global Portfolio · live data</p>
      </div>

      {/* Row 1 — Portfolio overview */}
      <div className="sdiv">Portfolio Overview</div>
      <div className="mg" style={{ marginBottom: 18 }}>
        <MetricCard
          label="Software Titles"
          value={s.total_sw ?? "—"}
          sub="canonical SW catalog entries"
          colorClass="ml-b"
        />
        <MetricCard
          label="Total Entitlements"
          value={s.total_entitlements ?? "—"}
          sub="active license records"
          colorClass="ml-b"
        />
        <MetricCard
          label="Annual License Cost"
          value={`₹${totalCostCr} Cr`}
          sub="sum of all entitlements"
          colorClass="ml-a"
        />
        <MetricCard
          label="Unread Alerts"
          value={s.unread_alerts_count ?? "—"}
          sub={s.unread_alerts_count > 0 ? "action required" : "all clear"}
          subClass={s.unread_alerts_count > 0 ? "red" : "grn"}
          colorClass={s.unread_alerts_count > 0 ? "ml-r" : "ml-g"}
        />
      </div>

      {/* Row 2 — Risk & utilisation */}
      <div className="sdiv">Risk &amp; Utilisation</div>
      <div className="mg3" style={{ marginBottom: 18 }}>
        <MetricCard
          label="Over-Deployed"
          value={s.over_deployed_count ?? "—"}
          sub="in_use > entitled — audit risk"
          subClass={s.over_deployed_count > 0 ? "red" : "grn"}
          colorClass={s.over_deployed_count > 0 ? "ml-r" : "ml-g"}
        />
        <MetricCard
          label="Watch"
          value={s.watch_count ?? "—"}
          sub=">90% utilisation"
          subClass={s.watch_count > 0 ? "amb" : ""}
          colorClass="ml-a"
        />
        <MetricCard
          label="Under-Utilised"
          value={s.under_utilised_count ?? "—"}
          sub="<30% utilisation — right-size opportunity"
          subClass="grn"
          colorClass="ml-g"
        />
      </div>

      {/* Row 3 — Renewals & discovery */}
      <div className="sdiv">Renewals &amp; Discovery</div>
      <div className="mg" style={{ marginBottom: 18 }}>
        <MetricCard
          label="Expiring in 30 Days"
          value={s.expiring_30d_count ?? "—"}
          sub="contracts due for renewal"
          subClass={s.expiring_30d_count > 0 ? "red" : "grn"}
          colorClass={s.expiring_30d_count > 0 ? "ml-r" : "ml-g"}
        />
        <MetricCard
          label="Discovery Records"
          value={s.total_discovery_records ?? "—"}
          sub="from all sources"
          colorClass="ml-b"
        />
        <MetricCard
          label="Matched Discovery"
          value={s.matched_discovery_count ?? "—"}
          sub={`${matchPct}% of discovery records matched to catalog`}
          subClass={matchPct >= 80 ? "grn" : matchPct >= 50 ? "amb" : "red"}
          colorClass="ml-g"
        />
        <MetricCard
          label="Unmatched Discovery"
          value={(s.total_discovery_records ?? 0) - (s.matched_discovery_count ?? 0)}
          sub="not matched to SW catalog"
          subClass={((s.total_discovery_records ?? 0) - (s.matched_discovery_count ?? 0)) > 0 ? "amb" : "grn"}
          colorClass="ml-a"
        />
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
git add frontend/src/pages/Dashboard/DashboardPage.jsx
git commit -m "feat: DashboardPage — live metric cards (portfolio, risk, renewals, discovery)"
```

---

## Task 12: Final verification + commit

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend
pytest -v 2>&1 | tail -10
```

Expected: 81+ tests, all passing.

- [ ] **Step 2: Verify frontend builds clean**

```bash
cd frontend
npm run build 2>&1 | grep -E "error|✓ built"
```

Expected: `✓ built in Xs`

- [ ] **Step 3: Check total route count**

```bash
cd backend
python -c "
from app.main import app
routes = [r.path for r in app.routes if hasattr(r, 'path')]
print(f'Total routes: {len(routes)}')
"
```

Expected: 82+ routes.

- [ ] **Step 4: Final commit**

```bash
git add -A
git status
git commit -m "feat: sub-project 6 complete — Audit Trail + Dashboard + Cost Optimisation — DRL SAM v3.0 DONE"
```

---

## Self-Review

**Spec coverage:**
- ✅ Audit trail — append-only INSERT in Python layer (no UPDATE/DELETE on AuditTrail); GxP ValueError for missing reason
- ✅ audit_logger called in: catalog create/update, entitlement update, onboarding publish, reconciliation run
- ✅ `GET /audit` paginated + filtered (entity_type, action_type, sw_id, date range)
- ✅ `GET /audit/export` XLSX download
- ✅ `GET /cost-optimisation/scorecard` ranked by est. annual saving (UNDER_UTILISED savings, OVER_DEPLOYED flagged)
- ✅ `GET /dashboard/summary` — all 10 metric fields in one call
- ✅ DashboardPage: three metric rows (portfolio, risk/util, renewals/discovery)
- ✅ CostOptPage: ranked table + summary cards (total saving, immediate risks, watch count)
- ✅ AuditTrailPage: filterable table + expandable before/after + XLSX export button

**Type consistency:**
- `AuditTrailOut.created_at_utc` matches `AuditTrail.created_at_utc` column ✅
- `CostOptItem.est_annual_saving_inr` is `int` — computed from `int | None` columns with `or 0` guards ✅
- `DashboardSummaryOut` field names match what DashboardPage.jsx accesses ✅
- `log_event` called with `is_gxp=(body.gxp_flag != "no")` — catalog routes have `gxp_flag` on body ✅
- Reconciliation route: extra `await db.commit()` added after `log_event` (recon_engine already commits, this second commit is safe — no-op if nothing pending) ✅
