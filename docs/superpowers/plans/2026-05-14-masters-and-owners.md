# DRL SAM Platform — Sub-project 2: Masters & App Owners

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full CRUD API + UI for all 7 master tables and the App Owner / DOA registry, with seed data pre-loaded and UI matching the prototype exactly.

**Architecture:** FastAPI routers for `/api/v1/masters/*` and `/api/v1/owners/*` backed by existing SQLAlchemy models. React pages replace placeholder stubs — each master tab is an inner function component sharing a single file. All dropdowns across the platform populate from `/api/v1/masters/all`.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Pydantic v2, pytest-asyncio, React 18, Zustand, Axios.

---

## Task 1: Backend schemas — masters

**Files:**
- Create: `backend/app/schemas/masters.py`

- [ ] **Step 1: Create `backend/app/schemas/masters.py`**

```python
from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


# ── Category ──────────────────────────────────────────────────────────────────
class SubCategoryOut(BaseModel):
    id: UUID
    category_id: UUID
    name: str
    model_config = {"from_attributes": True}


class SubCategoryCreate(BaseModel):
    category_id: UUID
    name: str


class CategoryCreate(BaseModel):
    name: str
    gxp_applicable: str = "no"   # "no" | "yes" | "mixed"


class CategoryOut(BaseModel):
    id: UUID
    name: str
    gxp_applicable: str
    created_at: datetime | None = None
    sub_categories: list[SubCategoryOut] = []
    model_config = {"from_attributes": True}


# ── Vendor ────────────────────────────────────────────────────────────────────
class VendorCreate(BaseModel):
    name: str
    audit_risk: str = "LOW"        # "LOW" | "MEDIUM" | "HIGH"
    last_audit_date: str | None = None
    notes: str | None = None


class VendorOut(VendorCreate):
    id: UUID
    model_config = {"from_attributes": True}


# ── License Metric ────────────────────────────────────────────────────────────
class MetricCreate(BaseModel):
    name: str
    description: str | None = None
    how_to_count: str | None = None


class MetricOut(MetricCreate):
    id: UUID
    model_config = {"from_attributes": True}


# ── Discovery Source ──────────────────────────────────────────────────────────
class DiscoverySourceCreate(BaseModel):
    name: str
    type: str = "manual"
    coverage: str | None = None
    frequency: str | None = None
    contact: str | None = None
    status: str = "active"         # "active" | "inactive" | "stale"
    notes: str | None = None


class DiscoverySourceOut(DiscoverySourceCreate):
    id: UUID
    model_config = {"from_attributes": True}


# ── Usage Update Method ───────────────────────────────────────────────────────
class UsageMethodCreate(BaseModel):
    name: str
    description: str | None = None
    template_required: str = "none"   # "none" | "tab_a" | "tab_a_and_b"


class UsageMethodOut(UsageMethodCreate):
    id: UUID
    model_config = {"from_attributes": True}


# ── Region ────────────────────────────────────────────────────────────────────
class RegionCreate(BaseModel):
    name: str
    sites_json: str | None = None
    regulatory_zone: str | None = None
    data_residency: str | None = None
    aws_region: str | None = None


class RegionOut(RegionCreate):
    id: UUID
    model_config = {"from_attributes": True}


# ── All-masters response (for dropdown population) ───────────────────────────
class AllMastersOut(BaseModel):
    categories: list[CategoryOut]
    vendors: list[VendorOut]
    metrics: list[MetricOut]
    sources: list[DiscoverySourceOut]
    methods: list[UsageMethodOut]
    regions: list[RegionOut]
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/masters.py
git commit -m "feat: Pydantic schemas for all 7 master tables"
```

---

## Task 2: Backend schemas — owners

**Files:**
- Create: `backend/app/schemas/owners.py`

- [ ] **Step 1: Create `backend/app/schemas/owners.py`**

```python
from __future__ import annotations
from uuid import UUID
from pydantic import BaseModel, EmailStr


class AppOwnerCreate(BaseModel):
    email: str
    full_name: str
    password: str
    bu: str | None = None
    region_id: UUID | None = None


class AppOwnerUpdate(BaseModel):
    full_name: str | None = None
    bu: str | None = None
    region_id: UUID | None = None
    is_active: bool | None = None


class AppOwnerOut(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    bu: str | None = None
    is_active: bool
    model_config = {"from_attributes": True}


class DOACreate(BaseModel):
    user_id: UUID
    tier: str = "2"               # "1" | "2"
    role_label: str | None = None
    alert_scope: str | None = None
    software_categories_json: str | None = None


class DOAUpdate(BaseModel):
    tier: str | None = None
    role_label: str | None = None
    alert_scope: str | None = None
    software_categories_json: str | None = None


class DOAOut(BaseModel):
    id: UUID
    user_id: UUID
    tier: str
    role_label: str | None = None
    alert_scope: str | None = None
    software_categories_json: str | None = None
    user: AppOwnerOut
    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/owners.py
git commit -m "feat: Pydantic schemas for app owners and DOA hierarchy"
```

---

## Task 3: Backend route — masters

**Files:**
- Create: `backend/app/api/v1/routes/masters.py`

- [ ] **Step 1: Create `backend/app/api/v1/routes/masters.py`**

```python
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.api.deps import require_role
from app.models.masters import Category, SubCategory, Vendor, LicenseMetric, DiscoverySource, UsageUpdateMethod, Region
from app.schemas.masters import (
    CategoryCreate, CategoryOut, SubCategoryCreate, SubCategoryOut,
    VendorCreate, VendorOut,
    MetricCreate, MetricOut,
    DiscoverySourceCreate, DiscoverySourceOut,
    UsageMethodCreate, UsageMethodOut,
    RegionCreate, RegionOut,
    AllMastersOut,
)

router = APIRouter(prefix="/masters", tags=["masters"])
admin_only = Depends(require_role(["COE_ADMIN"]))


# ── All masters (for dropdown population) ─────────────────────────────────────
@router.get("/all", response_model=AllMastersOut)
async def get_all_masters(db: AsyncSession = Depends(get_db)):
    cats = (await db.execute(select(Category).options(selectinload(Category.sub_categories)))).scalars().all()
    vendors = (await db.execute(select(Vendor))).scalars().all()
    metrics = (await db.execute(select(LicenseMetric))).scalars().all()
    sources = (await db.execute(select(DiscoverySource))).scalars().all()
    methods = (await db.execute(select(UsageUpdateMethod))).scalars().all()
    regions = (await db.execute(select(Region))).scalars().all()
    return AllMastersOut(
        categories=[CategoryOut.model_validate(c) for c in cats],
        vendors=[VendorOut.model_validate(v) for v in vendors],
        metrics=[MetricOut.model_validate(m) for m in metrics],
        sources=[DiscoverySourceOut.model_validate(s) for s in sources],
        methods=[UsageMethodOut.model_validate(m) for m in methods],
        regions=[RegionOut.model_validate(r) for r in regions],
    )


# ── Categories ────────────────────────────────────────────────────────────────
@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).options(selectinload(Category.sub_categories)))
    return [CategoryOut.model_validate(c) for c in result.scalars().all()]


@router.post("/categories", response_model=CategoryOut, status_code=201, dependencies=[admin_only])
async def create_category(body: CategoryCreate, db: AsyncSession = Depends(get_db)):
    cat = Category(**body.model_dump())
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return CategoryOut.model_validate(cat)


@router.put("/categories/{cat_id}", response_model=CategoryOut, dependencies=[admin_only])
async def update_category(cat_id: UUID, body: CategoryCreate, db: AsyncSession = Depends(get_db)):
    cat = await db.get(Category, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    for k, v in body.model_dump().items():
        setattr(cat, k, v)
    await db.commit()
    await db.refresh(cat)
    return CategoryOut.model_validate(cat)


@router.delete("/categories/{cat_id}", status_code=204, dependencies=[admin_only])
async def delete_category(cat_id: UUID, db: AsyncSession = Depends(get_db)):
    cat = await db.get(Category, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    await db.delete(cat)
    await db.commit()


# ── Sub-categories ────────────────────────────────────────────────────────────
@router.post("/sub-categories", response_model=SubCategoryOut, status_code=201, dependencies=[admin_only])
async def create_sub_category(body: SubCategoryCreate, db: AsyncSession = Depends(get_db)):
    sub = SubCategory(**body.model_dump())
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return SubCategoryOut.model_validate(sub)


@router.delete("/sub-categories/{sub_id}", status_code=204, dependencies=[admin_only])
async def delete_sub_category(sub_id: UUID, db: AsyncSession = Depends(get_db)):
    sub = await db.get(SubCategory, sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Sub-category not found")
    await db.delete(sub)
    await db.commit()


# ── Vendors ───────────────────────────────────────────────────────────────────
@router.get("/vendors", response_model=list[VendorOut])
async def list_vendors(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Vendor))
    return [VendorOut.model_validate(v) for v in result.scalars().all()]


@router.post("/vendors", response_model=VendorOut, status_code=201, dependencies=[admin_only])
async def create_vendor(body: VendorCreate, db: AsyncSession = Depends(get_db)):
    v = Vendor(**body.model_dump())
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return VendorOut.model_validate(v)


@router.put("/vendors/{vid}", response_model=VendorOut, dependencies=[admin_only])
async def update_vendor(vid: UUID, body: VendorCreate, db: AsyncSession = Depends(get_db)):
    v = await db.get(Vendor, vid)
    if not v:
        raise HTTPException(status_code=404, detail="Vendor not found")
    for k, val in body.model_dump().items():
        setattr(v, k, val)
    await db.commit()
    await db.refresh(v)
    return VendorOut.model_validate(v)


@router.delete("/vendors/{vid}", status_code=204, dependencies=[admin_only])
async def delete_vendor(vid: UUID, db: AsyncSession = Depends(get_db)):
    v = await db.get(Vendor, vid)
    if not v:
        raise HTTPException(status_code=404, detail="Vendor not found")
    await db.delete(v)
    await db.commit()


# ── License Metrics ───────────────────────────────────────────────────────────
@router.get("/metrics", response_model=list[MetricOut])
async def list_metrics(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LicenseMetric))
    return [MetricOut.model_validate(m) for m in result.scalars().all()]


@router.post("/metrics", response_model=MetricOut, status_code=201, dependencies=[admin_only])
async def create_metric(body: MetricCreate, db: AsyncSession = Depends(get_db)):
    m = LicenseMetric(**body.model_dump())
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return MetricOut.model_validate(m)


@router.put("/metrics/{mid}", response_model=MetricOut, dependencies=[admin_only])
async def update_metric(mid: UUID, body: MetricCreate, db: AsyncSession = Depends(get_db)):
    m = await db.get(LicenseMetric, mid)
    if not m:
        raise HTTPException(status_code=404, detail="Metric not found")
    for k, v in body.model_dump().items():
        setattr(m, k, v)
    await db.commit()
    await db.refresh(m)
    return MetricOut.model_validate(m)


@router.delete("/metrics/{mid}", status_code=204, dependencies=[admin_only])
async def delete_metric(mid: UUID, db: AsyncSession = Depends(get_db)):
    m = await db.get(LicenseMetric, mid)
    if not m:
        raise HTTPException(status_code=404, detail="Metric not found")
    await db.delete(m)
    await db.commit()


# ── Discovery Sources ─────────────────────────────────────────────────────────
@router.get("/discovery-sources", response_model=list[DiscoverySourceOut])
async def list_sources(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DiscoverySource))
    return [DiscoverySourceOut.model_validate(s) for s in result.scalars().all()]


@router.post("/discovery-sources", response_model=DiscoverySourceOut, status_code=201, dependencies=[admin_only])
async def create_source(body: DiscoverySourceCreate, db: AsyncSession = Depends(get_db)):
    s = DiscoverySource(**body.model_dump())
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return DiscoverySourceOut.model_validate(s)


@router.put("/discovery-sources/{sid}", response_model=DiscoverySourceOut, dependencies=[admin_only])
async def update_source(sid: UUID, body: DiscoverySourceCreate, db: AsyncSession = Depends(get_db)):
    s = await db.get(DiscoverySource, sid)
    if not s:
        raise HTTPException(status_code=404, detail="Source not found")
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    await db.commit()
    await db.refresh(s)
    return DiscoverySourceOut.model_validate(s)


@router.delete("/discovery-sources/{sid}", status_code=204, dependencies=[admin_only])
async def delete_source(sid: UUID, db: AsyncSession = Depends(get_db)):
    s = await db.get(DiscoverySource, sid)
    if not s:
        raise HTTPException(status_code=404, detail="Source not found")
    await db.delete(s)
    await db.commit()


# ── Usage Update Methods ──────────────────────────────────────────────────────
@router.get("/usage-methods", response_model=list[UsageMethodOut])
async def list_methods(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UsageUpdateMethod))
    return [UsageMethodOut.model_validate(m) for m in result.scalars().all()]


@router.post("/usage-methods", response_model=UsageMethodOut, status_code=201, dependencies=[admin_only])
async def create_method(body: UsageMethodCreate, db: AsyncSession = Depends(get_db)):
    m = UsageUpdateMethod(**body.model_dump())
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return UsageMethodOut.model_validate(m)


@router.put("/usage-methods/{mid}", response_model=UsageMethodOut, dependencies=[admin_only])
async def update_method(mid: UUID, body: UsageMethodCreate, db: AsyncSession = Depends(get_db)):
    m = await db.get(UsageUpdateMethod, mid)
    if not m:
        raise HTTPException(status_code=404, detail="Method not found")
    for k, v in body.model_dump().items():
        setattr(m, k, v)
    await db.commit()
    await db.refresh(m)
    return UsageMethodOut.model_validate(m)


@router.delete("/usage-methods/{mid}", status_code=204, dependencies=[admin_only])
async def delete_method(mid: UUID, db: AsyncSession = Depends(get_db)):
    m = await db.get(UsageUpdateMethod, mid)
    if not m:
        raise HTTPException(status_code=404, detail="Method not found")
    await db.delete(m)
    await db.commit()


# ── Regions ───────────────────────────────────────────────────────────────────
@router.get("/regions", response_model=list[RegionOut])
async def list_regions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Region))
    return [RegionOut.model_validate(r) for r in result.scalars().all()]


@router.post("/regions", response_model=RegionOut, status_code=201, dependencies=[admin_only])
async def create_region(body: RegionCreate, db: AsyncSession = Depends(get_db)):
    r = Region(**body.model_dump())
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return RegionOut.model_validate(r)


@router.put("/regions/{rid}", response_model=RegionOut, dependencies=[admin_only])
async def update_region(rid: UUID, body: RegionCreate, db: AsyncSession = Depends(get_db)):
    r = await db.get(Region, rid)
    if not r:
        raise HTTPException(status_code=404, detail="Region not found")
    for k, v in body.model_dump().items():
        setattr(r, k, v)
    await db.commit()
    await db.refresh(r)
    return RegionOut.model_validate(r)


@router.delete("/regions/{rid}", status_code=204, dependencies=[admin_only])
async def delete_region(rid: UUID, db: AsyncSession = Depends(get_db)):
    r = await db.get(Region, rid)
    if not r:
        raise HTTPException(status_code=404, detail="Region not found")
    await db.delete(r)
    await db.commit()
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/v1/routes/masters.py
git commit -m "feat: masters CRUD router — all 7 tables"
```

---

## Task 4: Backend route — owners

**Files:**
- Create: `backend/app/api/v1/routes/owners.py`

- [ ] **Step 1: Create `backend/app/api/v1/routes/owners.py`**

```python
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.api.deps import require_role
from app.core.security import get_password_hash
from app.models.users import User, DOAHierarchy
from app.schemas.owners import AppOwnerCreate, AppOwnerUpdate, AppOwnerOut, DOACreate, DOAUpdate, DOAOut

router = APIRouter(prefix="/owners", tags=["owners"])
admin_only = Depends(require_role(["COE_ADMIN"]))


# ── App Owners ────────────────────────────────────────────────────────────────
@router.get("", response_model=list[AppOwnerOut])
async def list_owners(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.role == "APP_OWNER", User.is_active == True))
    return [AppOwnerOut.model_validate(u) for u in result.scalars().all()]


@router.post("", response_model=AppOwnerOut, status_code=201, dependencies=[admin_only])
async def create_owner(body: AppOwnerCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        email=body.email,
        full_name=body.full_name,
        hashed_password=get_password_hash(body.password),
        role="APP_OWNER",
        bu=body.bu,
        region_id=body.region_id,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return AppOwnerOut.model_validate(user)


@router.put("/{uid}", response_model=AppOwnerOut, dependencies=[admin_only])
async def update_owner(uid: UUID, body: AppOwnerUpdate, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(user, k, v)
    await db.commit()
    await db.refresh(user)
    return AppOwnerOut.model_validate(user)


@router.delete("/{uid}", status_code=204, dependencies=[admin_only])
async def deactivate_owner(uid: UUID, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False   # soft delete — preserves FK references
    await db.commit()


# ── DOA Hierarchy ─────────────────────────────────────────────────────────────
@router.get("/doa", response_model=list[DOAOut])
async def list_doa(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DOAHierarchy).options(selectinload(DOAHierarchy.user)))
    # selectinload requires relationship on model — add it below if missing
    rows = result.scalars().all()
    out = []
    for row in rows:
        user = await db.get(User, row.user_id)
        d = DOAOut(
            id=row.id, user_id=row.user_id, tier=row.tier,
            role_label=row.role_label, alert_scope=row.alert_scope,
            software_categories_json=row.software_categories_json,
            user=AppOwnerOut.model_validate(user),
        )
        out.append(d)
    return out


@router.post("/doa", response_model=DOAOut, status_code=201, dependencies=[admin_only])
async def create_doa(body: DOACreate, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, body.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found — create the user first")
    doa = DOAHierarchy(**body.model_dump())
    db.add(doa)
    await db.commit()
    await db.refresh(doa)
    return DOAOut(
        id=doa.id, user_id=doa.user_id, tier=doa.tier,
        role_label=doa.role_label, alert_scope=doa.alert_scope,
        software_categories_json=doa.software_categories_json,
        user=AppOwnerOut.model_validate(user),
    )


@router.put("/doa/{did}", response_model=DOAOut, dependencies=[admin_only])
async def update_doa(did: UUID, body: DOAUpdate, db: AsyncSession = Depends(get_db)):
    doa = await db.get(DOAHierarchy, did)
    if not doa:
        raise HTTPException(status_code=404, detail="DOA record not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(doa, k, v)
    await db.commit()
    await db.refresh(doa)
    user = await db.get(User, doa.user_id)
    return DOAOut(
        id=doa.id, user_id=doa.user_id, tier=doa.tier,
        role_label=doa.role_label, alert_scope=doa.alert_scope,
        software_categories_json=doa.software_categories_json,
        user=AppOwnerOut.model_validate(user),
    )


@router.delete("/doa/{did}", status_code=204, dependencies=[admin_only])
async def delete_doa(did: UUID, db: AsyncSession = Depends(get_db)):
    doa = await db.get(DOAHierarchy, did)
    if not doa:
        raise HTTPException(status_code=404, detail="DOA record not found")
    await db.delete(doa)
    await db.commit()
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/v1/routes/owners.py
git commit -m "feat: owners CRUD router — app owners and DOA hierarchy"
```

---

## Task 5: Wire routers into main.py + update seed data

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/scripts/seed.py`

- [ ] **Step 1: Register new routers in `backend/app/main.py`**

Add after the existing `auth_router` import and include:

```python
from app.api.v1.routes.masters import router as masters_router
from app.api.v1.routes.owners import router as owners_router
```

And add after `app.include_router(auth_router, prefix="/api/v1")`:

```python
app.include_router(masters_router, prefix="/api/v1")
app.include_router(owners_router, prefix="/api/v1")
```

- [ ] **Step 2: Verify routes registered**

```bash
cd backend
.venv/bin/python -c "
from app.main import app
paths = sorted(set(r.path for r in app.routes if hasattr(r,'path')))
[print(p) for p in paths if 'masters' in p or 'owners' in p]
"
```

Expected — at minimum these paths printed:
```
/api/v1/masters/all
/api/v1/masters/categories
/api/v1/masters/vendors
/api/v1/masters/metrics
/api/v1/masters/discovery-sources
/api/v1/masters/usage-methods
/api/v1/masters/regions
/api/v1/owners
/api/v1/owners/doa
```

- [ ] **Step 3: Replace `backend/scripts/seed.py` with master data + 7 DRL users**

```python
"""
Idempotent seed — creates users, master data, DOA hierarchy.
Run: python -m scripts.seed
Auto-runs on startup when STORAGE_BACKEND=supabase|local.
"""
import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.users import User, DOAHierarchy
from app.models.masters import (
    Category, SubCategory, Vendor, LicenseMetric,
    DiscoverySource, UsageUpdateMethod, Region,
)
import app.models  # noqa

# ── Users ──────────────────────────────────────────────────────────────────────
SEED_USERS = [
    {"email": "admin@drl.local",     "full_name": "COE Admin",          "password": "Admin123!", "role": "COE_ADMIN",  "bu": "IT COE"},
    {"email": "appowner@drl.local",  "full_name": "App Owner",           "password": "Owner123!", "role": "APP_OWNER",  "bu": "IT Ops"},
    {"email": "cio@drl.local",       "full_name": "CIO Read Only",       "password": "Read123!",  "role": "READ_ONLY",  "bu": "IT COE"},
    {"email": "s.narayanan@drl.com", "full_name": "S. Narayanan",        "password": "Admin123!", "role": "COE_ADMIN",  "bu": "IT COE"},
    {"email": "p.verma@drl.com",     "full_name": "P. Verma",            "password": "Admin123!", "role": "COE_ADMIN",  "bu": "IT COE"},
    {"email": "j.williams@drl.com",  "full_name": "J. Williams",         "password": "Owner123!", "role": "APP_OWNER",  "bu": "IT Ops"},
    {"email": "r.chen@drl.com",      "full_name": "R. Chen",             "password": "Owner123!", "role": "APP_OWNER",  "bu": "QC Labs"},
    {"email": "k.patel@drl.com",     "full_name": "K. Patel",            "password": "Owner123!", "role": "APP_OWNER",  "bu": "ERP"},
    {"email": "m.garcia@drl.com",    "full_name": "M. Garcia",           "password": "Owner123!", "role": "APP_OWNER",  "bu": "Manufacturing"},
]

# ── Categories ─────────────────────────────────────────────────────────────────
SEED_CATEGORIES = [
    {"name": "Enterprise Productivity", "gxp_applicable": "no",
     "subs": ["Office Suite", "PDF Management", "Diagramming", "Automation", "Low-Code"]},
    {"name": "R&D & Lab Informatics",   "gxp_applicable": "yes",
     "subs": ["LIMS", "ELN", "CDS", "Scientific Data", "Image Analysis"]},
    {"name": "Quality & Compliance",    "gxp_applicable": "yes",
     "subs": ["QMS", "Validation", "Training Mgmt", "GRC"]},
    {"name": "Manufacturing Execution", "gxp_applicable": "yes",
     "subs": ["MES", "DCS/SCADA", "Process Historian", "CMMS", "Engineering"]},
    {"name": "IT Infrastructure",       "gxp_applicable": "mixed",
     "subs": ["Server OS", "Database", "ITSM", "Virtualization", "Backup", "Cloud"]},
    {"name": "ERP & Supply Chain",      "gxp_applicable": "mixed",
     "subs": ["ERP", "SCM Planning", "WMS", "Serialization"]},
    {"name": "IT Security",             "gxp_applicable": "mixed",
     "subs": ["EDR/XDR", "SIEM", "Firewall", "PAM", "Vulnerability Mgmt"]},
]

# ── Vendors ────────────────────────────────────────────────────────────────────
SEED_VENDORS = [
    {"name": "Oracle",          "audit_risk": "HIGH",   "last_audit_date": "2022", "notes": "LMS audit risk — track NUP meticulously"},
    {"name": "SAP",             "audit_risk": "HIGH",   "last_audit_date": "2023", "notes": "User type classification matters for audit"},
    {"name": "IBM",             "audit_risk": "HIGH",   "last_audit_date": None,   "notes": "Sub-capacity licensing — requires IBM tools"},
    {"name": "Broadcom/VMware", "audit_risk": "HIGH",   "last_audit_date": "2024", "notes": "New licensing model post-acquisition — urgent review"},
    {"name": "Microsoft",       "audit_risk": "MEDIUM", "last_audit_date": "2024", "notes": "EA agreement — annual true-up"},
    {"name": "Adobe",           "audit_risk": "LOW",    "last_audit_date": None,   "notes": "VIP licensing — seat-based"},
    {"name": "Veeva Systems",   "audit_risk": "LOW",    "last_audit_date": None,   "notes": "GxP SaaS — review before every renewal"},
    {"name": "CrowdStrike",     "audit_risk": "LOW",    "last_audit_date": None,   "notes": "EDR — endpoint-based"},
    {"name": "ServiceNow",      "audit_risk": "LOW",    "last_audit_date": None,   "notes": "ITSM subscription"},
    {"name": "LabWare",         "audit_risk": "LOW",    "last_audit_date": None,   "notes": "GxP LIMS — perpetual"},
    {"name": "Koerber Pharma",  "audit_risk": "LOW",    "last_audit_date": None,   "notes": "GxP MES — perpetual"},
    {"name": "AVEVA",           "audit_risk": "LOW",    "last_audit_date": None,   "notes": "Process historian"},
]

# ── License Metrics ────────────────────────────────────────────────────────────
SEED_METRICS = [
    {"name": "Per User",            "description": "Named user / seat",               "how_to_count": "Count active named users in the system"},
    {"name": "Concurrent User",     "description": "Simultaneous sessions pool",      "how_to_count": "Peak simultaneous usage — not total installs"},
    {"name": "Per Core (2-pack)",   "description": "SQL Server, some DBs",            "how_to_count": "Physical/virtual cores ÷ 2, minimum 4 packs/server"},
    {"name": "Per Core (16-pack)",  "description": "Windows Server Standard",         "how_to_count": "16-core minimum per server"},
    {"name": "Per Processor (NUP)", "description": "Oracle DB",                       "how_to_count": "All users with access rights — including inactive"},
    {"name": "Per Workstation",     "description": "CDS, scientific software",        "how_to_count": "Count validated/licensed workstations"},
    {"name": "Per Endpoint",        "description": "Security, MDM software",          "how_to_count": "All managed endpoints in scope"},
    {"name": "Per Site / Line",     "description": "MES, serialization",              "how_to_count": "Physical production site or manufacturing line count"},
    {"name": "Per Tag",             "description": "OSIsoft PI",                      "how_to_count": "Count of active PI data tags / streams"},
    {"name": "Per GB of Memory",    "description": "SAP HANA Database",               "how_to_count": "Total licensed memory in GB — measure actual allocation"},
    {"name": "Per Study",           "description": "Clinical EDC (Medidata)",         "how_to_count": "Count active clinical studies — inactive excluded"},
]

# ── Discovery Sources ──────────────────────────────────────────────────────────
SEED_SOURCES = [
    {"name": "SCCM (Microsoft MECM)", "type": "agent",  "coverage": "Domain-joined Windows",         "frequency": "Weekly",    "contact": "IT Ops — J. Williams",       "status": "active"},
    {"name": "ServiceNow CMDB",       "type": "cmdb",   "coverage": "All IT assets",                 "frequency": "Monthly",   "contact": "ITSM — A. Kumar",            "status": "stale"},
    {"name": "CrowdStrike Falcon",    "type": "edr",    "coverage": "All managed endpoints",         "frequency": "Real-time", "contact": "Security Ops — L. Martinez", "status": "active"},
    {"name": "Cortex XDR",            "type": "edr",    "coverage": "Servers only",                  "frequency": "Real-time", "contact": "Security Ops — L. Martinez", "status": "active"},
    {"name": "Manual / Procurement",  "type": "manual", "coverage": "License entitlements from POs", "frequency": "As purchased","contact": "Procurement — S. Patel",    "status": "active"},
    {"name": "Cloud CASB",            "type": "casb",   "coverage": "SaaS apps via corporate network","frequency": "Monthly",  "contact": "Security Ops — L. Martinez", "status": "active"},
]

# ── Usage Update Methods ───────────────────────────────────────────────────────
SEED_METHODS = [
    {"name": "Monthly Template Upload (XLSX)", "description": "App Owner downloads, fills, re-uploads monthly",       "template_required": "tab_a_and_b"},
    {"name": "Quarterly Manual Update",        "description": "App Owner manually enters count quarterly via form",   "template_required": "none"},
    {"name": "Auto via SCCM Feed",             "description": "SCCM weekly export auto-populates in-use count",      "template_required": "none"},
    {"name": "App Owner Manual Entry",         "description": "Ad hoc entry with mandatory reason-for-change",       "template_required": "none"},
    {"name": "Auto via CrowdStrike API",       "description": "CrowdStrike endpoint count pulled automatically",     "template_required": "none"},
]

# ── Regions ────────────────────────────────────────────────────────────────────
SEED_REGIONS = [
    {"name": "India",  "sites_json": "Mumbai R&D, Hyderabad Mfg, Hyderabad HQ",   "regulatory_zone": "CDSCO · Annex 11",      "data_residency": "India",              "aws_region": "ap-south-1"},
    {"name": "US",     "sites_json": "New York HQ, NJ QC Lab, NJ Mfg, US DC",     "regulatory_zone": "FDA · 21 CFR Part 11",   "data_residency": "US (AWS us-east-1)", "aws_region": "us-east-1"},
    {"name": "EU",     "sites_json": "Frankfurt Mfg, Frankfurt DC",               "regulatory_zone": "EMA · Annex 11 · GDPR",  "data_residency": "EU (AWS eu-central-1)","aws_region": "eu-central-1"},
    {"name": "Global", "sites_json": "All sites",                                 "regulatory_zone": "Multiple",               "data_residency": "Per-region",         "aws_region": None},
]


async def _upsert(session, model, unique_field: str, items: list[dict]) -> dict[str, object]:
    created = {}
    for data in items:
        key = data[unique_field]
        existing = (await session.execute(select(model).where(getattr(model, unique_field) == key))).scalar_one_or_none()
        if existing:
            print(f"  skip   {model.__tablename__}:{key}")
            created[key] = existing
        else:
            obj = model(**{k: v for k, v in data.items() if k != "subs"})
            session.add(obj)
            await session.flush()
            print(f"  create {model.__tablename__}:{key}")
            created[key] = obj
    return created


async def seed():
    async with AsyncSessionLocal() as session:
        # Users
        user_map: dict[str, User] = {}
        for u in SEED_USERS:
            existing = (await session.execute(select(User).where(User.email == u["email"]))).scalar_one_or_none()
            if existing:
                print(f"  skip   user:{u['email']}")
                user_map[u["email"]] = existing
            else:
                obj = User(email=u["email"], full_name=u["full_name"],
                           hashed_password=get_password_hash(u["password"]),
                           role=u["role"], bu=u["bu"], is_active=True)
                session.add(obj)
                await session.flush()
                print(f"  create user:{u['email']} [{u['role']}]")
                user_map[u["email"]] = obj

        # Categories + sub-categories
        for cat_data in SEED_CATEGORIES:
            existing = (await session.execute(select(Category).where(Category.name == cat_data["name"]))).scalar_one_or_none()
            if existing:
                print(f"  skip   category:{cat_data['name']}")
            else:
                cat = Category(name=cat_data["name"], gxp_applicable=cat_data["gxp_applicable"])
                session.add(cat)
                await session.flush()
                for sub_name in cat_data.get("subs", []):
                    session.add(SubCategory(category_id=cat.id, name=sub_name))
                print(f"  create category:{cat_data['name']} + {len(cat_data.get('subs',[]))} subs")

        # Other masters
        await _upsert(session, Vendor, "name", SEED_VENDORS)
        await _upsert(session, LicenseMetric, "name", SEED_METRICS)
        await _upsert(session, DiscoverySource, "name", SEED_SOURCES)
        await _upsert(session, UsageUpdateMethod, "name", SEED_METHODS)
        await _upsert(session, Region, "name", SEED_REGIONS)

        # DOA hierarchy (S. Narayanan Tier 1, P. Verma Tier 1)
        for email, tier, role_label, scope in [
            ("s.narayanan@drl.com", "1", "CIO",      "All · T-30+"),
            ("p.verma@drl.com",     "1", "COE Head", "All · T-30+ · GxP"),
        ]:
            u = user_map.get(email)
            if u:
                exists = (await session.execute(select(DOAHierarchy).where(DOAHierarchy.user_id == u.id))).scalar_one_or_none()
                if not exists:
                    session.add(DOAHierarchy(user_id=u.id, tier=tier, role_label=role_label, alert_scope=scope))
                    print(f"  create doa:{email}")

        await session.commit()
    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py backend/scripts/seed.py
git commit -m "feat: register masters+owners routers; expand seed with master data and DRL users"
```

---

## Task 6: Backend tests — masters + owners

**Files:**
- Create: `backend/tests/test_masters.py`
- Create: `backend/tests/test_owners.py`

- [ ] **Step 1: Create `backend/tests/test_masters.py`**

```python
import pytest


async def test_get_all_masters_empty(client):
    resp = await client.get("/api/v1/masters/all")
    assert resp.status_code == 200
    data = resp.json()
    for key in ("categories", "vendors", "metrics", "sources", "methods", "regions"):
        assert key in data


async def test_create_category_requires_admin(client):
    resp = await client.post("/api/v1/masters/categories", json={"name": "Test Cat"})
    assert resp.status_code == 403


async def test_create_and_list_category(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post("/api/v1/masters/categories", json={"name": "Test Cat", "gxp_applicable": "no"}, headers=h)
    assert resp.status_code == 201
    cat_id = resp.json()["id"]

    resp = await client.get("/api/v1/masters/categories")
    assert any(c["id"] == cat_id for c in resp.json())

    await client.delete(f"/api/v1/masters/categories/{cat_id}", headers=h)


async def test_update_category(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    create = await client.post("/api/v1/masters/categories", json={"name": "TempCat"}, headers=h)
    cat_id = create.json()["id"]

    resp = await client.put(f"/api/v1/masters/categories/{cat_id}", json={"name": "UpdatedCat", "gxp_applicable": "yes"}, headers=h)
    assert resp.status_code == 200
    assert resp.json()["name"] == "UpdatedCat"

    await client.delete(f"/api/v1/masters/categories/{cat_id}", headers=h)


async def test_create_and_list_vendor(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post("/api/v1/masters/vendors", json={"name": "TestVendor", "audit_risk": "LOW"}, headers=h)
    assert resp.status_code == 201
    vid = resp.json()["id"]

    resp = await client.get("/api/v1/masters/vendors")
    assert any(v["id"] == vid for v in resp.json())

    await client.delete(f"/api/v1/masters/vendors/{vid}", headers=h)


async def test_create_metric(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post("/api/v1/masters/metrics", json={"name": "Per Study", "description": "Clinical EDC"}, headers=h)
    assert resp.status_code == 201
    mid = resp.json()["id"]
    await client.delete(f"/api/v1/masters/metrics/{mid}", headers=h)


async def test_create_region(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post("/api/v1/masters/regions", json={"name": "APAC", "regulatory_zone": "Various"}, headers=h)
    assert resp.status_code == 201
    rid = resp.json()["id"]
    await client.delete(f"/api/v1/masters/regions/{rid}", headers=h)
```

- [ ] **Step 2: Create `backend/tests/test_owners.py`**

```python
import pytest


async def test_list_owners_empty(client):
    resp = await client.get("/api/v1/owners")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_create_owner_requires_admin(client):
    resp = await client.post("/api/v1/owners", json={
        "email": "test@drl.com", "full_name": "Test", "password": "pass"
    })
    assert resp.status_code == 403


async def test_create_and_deactivate_owner(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    resp = await client.post("/api/v1/owners", json={
        "email": "newowner@drl.local", "full_name": "New Owner", "password": "Owner123!", "bu": "Finance"
    }, headers=h)
    assert resp.status_code == 201
    uid = resp.json()["id"]
    assert resp.json()["role"] == "APP_OWNER"

    owners = (await client.get("/api/v1/owners")).json()
    assert any(o["id"] == uid for o in owners)

    del_resp = await client.delete(f"/api/v1/owners/{uid}", headers=h)
    assert del_resp.status_code == 204

    owners_after = (await client.get("/api/v1/owners")).json()
    assert not any(o["id"] == uid for o in owners_after)


async def test_create_owner_duplicate_email(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    payload = {"email": "dup@drl.local", "full_name": "Dup", "password": "pass"}
    await client.post("/api/v1/owners", json=payload, headers=h)
    resp2 = await client.post("/api/v1/owners", json=payload, headers=h)
    assert resp2.status_code == 409


async def test_list_doa(client):
    resp = await client.get("/api/v1/owners/doa")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
```

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_masters.py backend/tests/test_owners.py
git commit -m "test: masters and owners endpoint test suites"
```

---

## Task 7: Frontend API modules

**Files:**
- Create: `frontend/src/api/masters.js`
- Create: `frontend/src/api/owners.js`

- [ ] **Step 1: Create `frontend/src/api/masters.js`**

```js
import client from "./client";

const base = "/masters";

export const fetchAllMasters = () => client.get(`${base}/all`).then(r => r.data);

export const fetchCategories = () => client.get(`${base}/categories`).then(r => r.data);
export const createCategory = (data) => client.post(`${base}/categories`, data).then(r => r.data);
export const updateCategory = (id, data) => client.put(`${base}/categories/${id}`, data).then(r => r.data);
export const deleteCategory = (id) => client.delete(`${base}/categories/${id}`);
export const createSubCategory = (data) => client.post(`${base}/sub-categories`, data).then(r => r.data);
export const deleteSubCategory = (id) => client.delete(`${base}/sub-categories/${id}`);

export const fetchVendors = () => client.get(`${base}/vendors`).then(r => r.data);
export const createVendor = (data) => client.post(`${base}/vendors`, data).then(r => r.data);
export const updateVendor = (id, data) => client.put(`${base}/vendors/${id}`, data).then(r => r.data);
export const deleteVendor = (id) => client.delete(`${base}/vendors/${id}`);

export const fetchMetrics = () => client.get(`${base}/metrics`).then(r => r.data);
export const createMetric = (data) => client.post(`${base}/metrics`, data).then(r => r.data);
export const updateMetric = (id, data) => client.put(`${base}/metrics/${id}`, data).then(r => r.data);
export const deleteMetric = (id) => client.delete(`${base}/metrics/${id}`);

export const fetchSources = () => client.get(`${base}/discovery-sources`).then(r => r.data);
export const createSource = (data) => client.post(`${base}/discovery-sources`, data).then(r => r.data);
export const updateSource = (id, data) => client.put(`${base}/discovery-sources/${id}`, data).then(r => r.data);
export const deleteSource = (id) => client.delete(`${base}/discovery-sources/${id}`);

export const fetchMethods = () => client.get(`${base}/usage-methods`).then(r => r.data);
export const createMethod = (data) => client.post(`${base}/usage-methods`, data).then(r => r.data);
export const updateMethod = (id, data) => client.put(`${base}/usage-methods/${id}`, data).then(r => r.data);
export const deleteMethod = (id) => client.delete(`${base}/usage-methods/${id}`);

export const fetchRegions = () => client.get(`${base}/regions`).then(r => r.data);
export const createRegion = (data) => client.post(`${base}/regions`, data).then(r => r.data);
export const updateRegion = (id, data) => client.put(`${base}/regions/${id}`, data).then(r => r.data);
export const deleteRegion = (id) => client.delete(`${base}/regions/${id}`);
```

- [ ] **Step 2: Create `frontend/src/api/owners.js`**

```js
import client from "./client";

export const fetchOwners = () => client.get("/owners").then(r => r.data);
export const createOwner = (data) => client.post("/owners", data).then(r => r.data);
export const updateOwner = (id, data) => client.put(`/owners/${id}`, data).then(r => r.data);
export const deactivateOwner = (id) => client.delete(`/owners/${id}`);

export const fetchDOA = () => client.get("/owners/doa").then(r => r.data);
export const createDOA = (data) => client.post("/owners/doa", data).then(r => r.data);
export const updateDOA = (id, data) => client.put(`/owners/doa/${id}`, data).then(r => r.data);
export const deleteDOA = (id) => client.delete(`/owners/doa/${id}`);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/masters.js frontend/src/api/owners.js
git commit -m "feat: frontend API modules for masters and owners"
```

---

## Task 8: Frontend — MastersPage

**Files:**
- Modify: `frontend/src/pages/Masters/MastersPage.jsx`

- [ ] **Step 1: Replace `frontend/src/pages/Masters/MastersPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from "react";
import {
  fetchCategories, createCategory, updateCategory, deleteCategory,
  createSubCategory, deleteSubCategory,
  fetchVendors, createVendor, updateVendor, deleteVendor,
  fetchMetrics, createMetric, updateMetric, deleteMetric,
  fetchSources, createSource, updateSource, deleteSource,
  fetchMethods, createMethod, updateMethod, deleteMethod,
  fetchRegions, createRegion, updateRegion, deleteRegion,
} from "../../api/masters";

const TABS = [
  "Categories", "Vendors", "License Metrics",
  "Discovery Sources", "Usage Methods", "Regions / Sites",
];

const GXP_BADGE = { no: <span className="tag tg2">No</span>, yes: <span className="tag tr2">GxP</span>, mixed: <span className="tag ta2">Mixed</span> };
const RISK_BADGE = { LOW: <span className="vr-low">LOW</span>, MEDIUM: <span className="vr-med">MED</span>, HIGH: <span className="vr-high">HIGH</span> };
const STATUS_BADGE = { active: <span className="tag tg2">Active</span>, inactive: <span className="tag tgr2">Inactive</span>, stale: <span className="tag ta2">Stale &gt;30d</span> };
const TPL_BADGE = { none: <span className="tag tgr2">No</span>, tab_a: <span className="tag tb3">Tab A</span>, tab_a_and_b: <span className="tag tg2">Tab A + Tab B</span> };

function useCRUD(fetcher) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try { setItems(await fetcher()); } finally { setLoading(false); }
  }, [fetcher]);
  useEffect(() => { reload(); }, [reload]);
  return { items, loading, reload };
}

// ── Categories ────────────────────────────────────────────────────────────────
function CategoriesPanel() {
  const { items, loading, reload } = useCRUD(fetchCategories);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", gxp_applicable: "no" });
  const [expanded, setExpanded] = useState({});

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await createCategory(form);
    setForm({ name: "", gxp_applicable: "no" });
    setShowAdd(false);
    reload();
  };
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this category and all its sub-categories?")) return;
    await deleteCategory(id);
    reload();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="ct">Software Categories &amp; Sub-Categories</div>
        <button className="btn btn-p btn-sm" onClick={() => setShowAdd(v => !v)}>+ Add Category</button>
      </div>
      {showAdd && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div className="fr3">
            <div className="fg"><label className="fl">Category Name <span className="req">*</span></label>
              <input className="fi2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Clinical Data Management" />
            </div>
            <div className="fg"><label className="fl">GxP Applicable?</label>
              <select className="fi2" value={form.gxp_applicable} onChange={e => setForm(f => ({ ...f, gxp_applicable: e.target.value }))}>
                <option value="no">No</option><option value="yes">Yes</option><option value="mixed">Mixed</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button className="btn btn-p btn-sm" onClick={handleAdd}>Save Category</button>
            <button className="btn btn-o btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="tw"><div className="tw-body">
        <table><thead><tr><th>Category</th><th>GxP</th><th>Sub-categories</th><th>Expand</th><th>Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan="5" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {items.map(cat => (
              <>
                <tr key={cat.id}>
                  <td><strong>{cat.name}</strong></td>
                  <td>{GXP_BADGE[cat.gxp_applicable]}</td>
                  <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{cat.sub_categories.map(s => s.name).join(" · ") || "—"}</td>
                  <td>
                    <button className="btn btn-o btn-sm" onClick={() => setExpanded(e => ({ ...e, [cat.id]: !e[cat.id] }))}>
                      {expanded[cat.id] ? "▲" : "▾ Expand"}
                    </button>
                  </td>
                  <td><div className="crud-actions">
                    <button className="btn btn-d btn-sm" onClick={() => handleDelete(cat.id)}>Delete</button>
                  </div></td>
                </tr>
                {expanded[cat.id] && (
                  <tr key={`${cat.id}-exp`}>
                    <td colSpan="5" style={{ padding: "10px 14px", background: "#FAFBFD", borderTop: "1px solid var(--bdr)" }}>
                      <div style={{ fontSize: 12, color: "var(--tx-m)", marginBottom: 8 }}>Sub-categories:</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {cat.sub_categories.map(s => (
                          <span key={s.id} style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 5, padding: "3px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                            {s.name}
                            <button style={{ border: "none", background: "none", color: "var(--tx-q)", cursor: "pointer" }} onClick={async () => { await deleteSubCategory(s.id); reload(); }}>×</button>
                          </span>
                        ))}
                        <button className="btn btn-o btn-sm" style={{ fontSize: 11 }} onClick={async () => {
                          const name = window.prompt("Sub-category name:");
                          if (name?.trim()) { await createSubCategory({ category_id: cat.id, name }); reload(); }
                        }}>+ Add Sub</button>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div></div>
    </>
  );
}

// ── Vendors ───────────────────────────────────────────────────────────────────
function VendorsPanel() {
  const { items, loading, reload } = useCRUD(fetchVendors);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", audit_risk: "LOW", last_audit_date: "", notes: "" });

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await createVendor({ ...form, last_audit_date: form.last_audit_date || null, notes: form.notes || null });
    setForm({ name: "", audit_risk: "LOW", last_audit_date: "", notes: "" });
    setShowAdd(false);
    reload();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="ct">Vendor Master</div>
        <button className="btn btn-p btn-sm" onClick={() => setShowAdd(v => !v)}>+ Add Vendor</button>
      </div>
      {showAdd && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div className="fr3">
            <div className="fg"><label className="fl">Vendor Name <span className="req">*</span></label>
              <input className="fi2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Medidata Solutions" />
            </div>
            <div className="fg"><label className="fl">Audit Risk</label>
              <select className="fi2" value={form.audit_risk} onChange={e => setForm(f => ({ ...f, audit_risk: e.target.value }))}>
                <option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option>
              </select>
            </div>
            <div className="fg"><label className="fl">Last Audit Year</label>
              <input className="fi2" value={form.last_audit_date} onChange={e => setForm(f => ({ ...f, last_audit_date: e.target.value }))} placeholder="e.g. 2024" />
            </div>
          </div>
          <div className="fg"><label className="fl">Notes</label>
            <input className="fi2" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
          </div>
          <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
            <button className="btn btn-p btn-sm" onClick={handleAdd}>Save Vendor</button>
            <button className="btn btn-o btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="tw"><div className="tw-body">
        <table><thead><tr><th>Vendor</th><th>Audit Risk</th><th>Last Audit</th><th>Notes</th><th>Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan="5" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {items.map(v => (
              <tr key={v.id}>
                <td><strong>{v.name}</strong></td>
                <td>{RISK_BADGE[v.audit_risk]}</td>
                <td style={{ fontSize: 11 }}>{v.last_audit_date || "—"}</td>
                <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{v.notes || "—"}</td>
                <td><div className="crud-actions">
                  <button className="btn btn-d btn-sm" onClick={async () => { if (window.confirm("Delete vendor?")) { await deleteVendor(v.id); reload(); } }}>Delete</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </>
  );
}

// ── Metrics ───────────────────────────────────────────────────────────────────
function MetricsPanel() {
  const { items, loading, reload } = useCRUD(fetchMetrics);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", how_to_count: "" });

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await createMetric({ ...form, description: form.description || null, how_to_count: form.how_to_count || null });
    setForm({ name: "", description: "", how_to_count: "" });
    setShowAdd(false);
    reload();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="ct">License Metrics</div>
        <button className="btn btn-p btn-sm" onClick={() => setShowAdd(v => !v)}>+ Add Metric</button>
      </div>
      {showAdd && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div className="fr3">
            <div className="fg"><label className="fl">Metric Name <span className="req">*</span></label>
              <input className="fi2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Per Study" />
            </div>
            <div className="fg"><label className="fl">Description</label>
              <input className="fi2" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" />
            </div>
            <div className="fg"><label className="fl">How to Count</label>
              <input className="fi2" value={form.how_to_count} onChange={e => setForm(f => ({ ...f, how_to_count: e.target.value }))} placeholder="e.g. Count active studies" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button className="btn btn-p btn-sm" onClick={handleAdd}>Save Metric</button>
            <button className="btn btn-o btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="tw"><div className="tw-body">
        <table><thead><tr><th>Metric</th><th>Description</th><th>How to Count</th><th>Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan="4" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {items.map(m => (
              <tr key={m.id}>
                <td><strong>{m.name}</strong></td>
                <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{m.description || "—"}</td>
                <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{m.how_to_count || "—"}</td>
                <td><div className="crud-actions">
                  <button className="btn btn-d btn-sm" onClick={async () => { if (window.confirm("Delete metric?")) { await deleteMetric(m.id); reload(); } }}>Delete</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </>
  );
}

// ── Discovery Sources ─────────────────────────────────────────────────────────
function SourcesPanel() {
  const { items, loading, reload } = useCRUD(fetchSources);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", type: "manual", coverage: "", frequency: "", contact: "", status: "active", notes: "" });

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await createSource({ ...form, coverage: form.coverage || null, frequency: form.frequency || null, contact: form.contact || null, notes: form.notes || null });
    setForm({ name: "", type: "manual", coverage: "", frequency: "", contact: "", status: "active", notes: "" });
    setShowAdd(false);
    reload();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="ct">Discovery Sources</div>
        <button className="btn btn-p btn-sm" onClick={() => setShowAdd(v => !v)}>+ Add Source</button>
      </div>
      {showAdd && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div className="fr3">
            <div className="fg"><label className="fl">Source Name <span className="req">*</span></label>
              <input className="fi2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Jamf Pro" />
            </div>
            <div className="fg"><label className="fl">Type</label>
              <select className="fi2" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {["agent","cmdb","edr","network","manual","casb","api"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="fg"><label className="fl">Coverage</label>
              <input className="fi2" value={form.coverage} onChange={e => setForm(f => ({ ...f, coverage: e.target.value }))} placeholder="e.g. macOS endpoints" />
            </div>
          </div>
          <div className="fr">
            <div className="fg"><label className="fl">Frequency</label>
              <input className="fi2" value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} placeholder="e.g. Weekly" />
            </div>
            <div className="fg"><label className="fl">Contact</label>
              <input className="fi2" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} placeholder="e.g. IT Ops — J. Williams" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button className="btn btn-p btn-sm" onClick={handleAdd}>Save Source</button>
            <button className="btn btn-o btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="tw"><div className="tw-body">
        <table><thead><tr><th>Source Name</th><th>Type</th><th>Coverage</th><th>Frequency</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan="7" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {items.map(s => (
              <tr key={s.id}>
                <td><strong>{s.name}</strong></td>
                <td style={{ fontSize: 11 }}>{s.type}</td>
                <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{s.coverage || "—"}</td>
                <td style={{ fontSize: 11 }}>{s.frequency || "—"}</td>
                <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{s.contact || "—"}</td>
                <td>{STATUS_BADGE[s.status]}</td>
                <td><div className="crud-actions">
                  <button className="btn btn-d btn-sm" onClick={async () => { if (window.confirm("Delete source?")) { await deleteSource(s.id); reload(); } }}>Delete</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </>
  );
}

// ── Usage Methods ─────────────────────────────────────────────────────────────
function MethodsPanel() {
  const { items, loading, reload } = useCRUD(fetchMethods);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", template_required: "none" });

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await createMethod({ ...form, description: form.description || null });
    setForm({ name: "", description: "", template_required: "none" });
    setShowAdd(false);
    reload();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="ct">Usage Update Methods</div>
        <button className="btn btn-p btn-sm" onClick={() => setShowAdd(v => !v)}>+ Add Method</button>
      </div>
      {showAdd && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div className="fr3">
            <div className="fg"><label className="fl">Method Name <span className="req">*</span></label>
              <input className="fi2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. API Auto-Sync" />
            </div>
            <div className="fg"><label className="fl">Description</label>
              <input className="fi2" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" />
            </div>
            <div className="fg"><label className="fl">Template Required?</label>
              <select className="fi2" value={form.template_required} onChange={e => setForm(f => ({ ...f, template_required: e.target.value }))}>
                <option value="none">No</option><option value="tab_a">Tab A only</option><option value="tab_a_and_b">Tab A + Tab B</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button className="btn btn-p btn-sm" onClick={handleAdd}>Save Method</button>
            <button className="btn btn-o btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="tw"><div className="tw-body">
        <table><thead><tr><th>Method Name</th><th>Description</th><th>Template Required</th><th>Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan="4" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {items.map(m => (
              <tr key={m.id}>
                <td><strong>{m.name}</strong></td>
                <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{m.description || "—"}</td>
                <td>{TPL_BADGE[m.template_required]}</td>
                <td><div className="crud-actions">
                  <button className="btn btn-d btn-sm" onClick={async () => { if (window.confirm("Delete method?")) { await deleteMethod(m.id); reload(); } }}>Delete</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </>
  );
}

// ── Regions ───────────────────────────────────────────────────────────────────
function RegionsPanel() {
  const { items, loading, reload } = useCRUD(fetchRegions);
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [form, setForm] = useState({ name: "", sites_json: "", regulatory_zone: "", data_residency: "", aws_region: "" });

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await createRegion({ ...form, sites_json: form.sites_json || null, regulatory_zone: form.regulatory_zone || null, data_residency: form.data_residency || null, aws_region: form.aws_region || null });
    setForm({ name: "", sites_json: "", regulatory_zone: "", data_residency: "", aws_region: "" });
    setShowAdd(false);
    reload();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="ct">Regions &amp; Sites</div>
        <button className="btn btn-p btn-sm" onClick={() => setShowAdd(v => !v)}>+ Add Region / Site</button>
      </div>
      {showAdd && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div className="fr3">
            <div className="fg"><label className="fl">Region Name <span className="req">*</span></label>
              <input className="fi2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Russia / CIS" />
            </div>
            <div className="fg"><label className="fl">Sites</label>
              <input className="fi2" value={form.sites_json} onChange={e => setForm(f => ({ ...f, sites_json: e.target.value }))} placeholder="Comma-separated site names" />
            </div>
            <div className="fg"><label className="fl">Regulatory Zone</label>
              <input className="fi2" value={form.regulatory_zone} onChange={e => setForm(f => ({ ...f, regulatory_zone: e.target.value }))} placeholder="e.g. FDA · 21 CFR Part 11" />
            </div>
          </div>
          <div className="fr">
            <div className="fg"><label className="fl">Data Residency</label>
              <input className="fi2" value={form.data_residency} onChange={e => setForm(f => ({ ...f, data_residency: e.target.value }))} placeholder="e.g. US (AWS us-east-1)" />
            </div>
            <div className="fg"><label className="fl">AWS Region</label>
              <input className="fi2" value={form.aws_region} onChange={e => setForm(f => ({ ...f, aws_region: e.target.value }))} placeholder="e.g. eu-central-1" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button className="btn btn-p btn-sm" onClick={handleAdd}>Save Region</button>
            <button className="btn btn-o btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="tw"><div className="tw-body">
        <table><thead><tr><th>Region</th><th>Regulatory Zone</th><th>Data Residency</th><th>Expand</th><th>Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan="5" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {items.map(r => (
              <>
                <tr key={r.id}>
                  <td><strong>{r.name}</strong></td>
                  <td style={{ fontSize: 11 }}>{r.regulatory_zone || "—"}</td>
                  <td style={{ fontSize: 11 }}>{r.data_residency || "—"}</td>
                  <td>
                    <button className="btn btn-o btn-sm" onClick={() => setExpanded(e => ({ ...e, [r.id]: !e[r.id] }))}>
                      {expanded[r.id] ? "▲" : "▾ Expand"}
                    </button>
                  </td>
                  <td><div className="crud-actions">
                    <button className="btn btn-d btn-sm" onClick={async () => { if (window.confirm("Delete region?")) { await deleteRegion(r.id); reload(); } }}>Delete</button>
                  </div></td>
                </tr>
                {expanded[r.id] && (
                  <tr key={`${r.id}-exp`}>
                    <td colSpan="5" style={{ padding: "10px 14px", background: "#FAFBFD", fontSize: 12, color: "var(--tx-m)", borderTop: "1px solid var(--bdr)" }}>
                      <strong>Sites:</strong> {r.sites_json || "—"} · <strong>AWS:</strong> {r.aws_region || "—"}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div></div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MastersPage() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> Masters &amp; Config</div>
        <h1>Masters &amp; Configuration</h1>
        <p>Admin-managed reference data · Full CRUD on all master tables · Changes apply platform-wide immediately</p>
      </div>

      <div className="stabs" style={{ marginBottom: 18 }}>
        {TABS.map((t, i) => (
          <button key={t} className={`stab${tab === i ? " active" : ""}`} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {tab === 0 && <CategoriesPanel />}
      {tab === 1 && <VendorsPanel />}
      {tab === 2 && <MetricsPanel />}
      {tab === 3 && <SourcesPanel />}
      {tab === 4 && <MethodsPanel />}
      {tab === 5 && <RegionsPanel />}
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend build still passes**

```bash
cd frontend && npm run build 2>&1 | grep -E "✓|error"
```

Expected: `✓ built in`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Masters/MastersPage.jsx
git commit -m "feat: MastersPage — 6-tab CRUD UI matching prototype"
```

---

## Task 9: Frontend — AppOwnersPage

**Files:**
- Modify: `frontend/src/pages/AppOwners/AppOwnersPage.jsx`

- [ ] **Step 1: Replace `frontend/src/pages/AppOwners/AppOwnersPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from "react";
import { fetchOwners, createOwner, deactivateOwner, fetchDOA, createDOA, deleteDOA } from "../../api/owners";
import { fetchOwners as fetchAllUsers } from "../../api/owners";

const TIER_BADGE = {
  "1": <span className="doa">Tier 1</span>,
  "2": <span className="doa" style={{ background: "var(--teal-m)" }}>Tier 2</span>,
};

function initials(name) {
  return (name || "?").split(" ").map(w => w[0] || "").join("").slice(0, 2).toUpperCase();
}

export default function AppOwnersPage() {
  const [owners, setOwners] = useState([]);
  const [doa, setDOA] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add-owner form
  const [showOwnerForm, setShowOwnerForm] = useState(false);
  const [ownerForm, setOwnerForm] = useState({ email: "", full_name: "", password: "", bu: "" });

  // Add-DOA form
  const [showDOAForm, setShowDOAForm] = useState(false);
  const [doaForm, setDOAForm] = useState({ user_id: "", tier: "2", role_label: "", alert_scope: "" });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [o, d] = await Promise.all([fetchOwners(), fetchDOA()]);
      setOwners(o);
      setDOA(d);
      setAllUsers(o);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleAddOwner = async () => {
    if (!ownerForm.email || !ownerForm.full_name || !ownerForm.password) return;
    await createOwner(ownerForm);
    setOwnerForm({ email: "", full_name: "", password: "", bu: "" });
    setShowOwnerForm(false);
    reload();
  };

  const handleAddDOA = async () => {
    if (!doaForm.user_id) return;
    await createDOA({ ...doaForm, role_label: doaForm.role_label || null, alert_scope: doaForm.alert_scope || null });
    setDOAForm({ user_id: "", tier: "2", role_label: "", alert_scope: "" });
    setShowDOAForm(false);
    reload();
  };

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> App Owners</div>
        <h1>Application Owner Registry</h1>
        <p>DOA Escalation Hierarchy · Application Owners · Admin CRUD enabled</p>
      </div>

      {/* ── DOA Hierarchy ─────────────────────────────────────────────── */}
      <div className="sdiv">DOA Escalation Hierarchy</div>

      <div className="sr">
        <button className="btn btn-p btn-sm" onClick={() => setShowDOAForm(v => !v)}>+ Add DOA Contact</button>
      </div>

      {showDOAForm && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div className="fr3">
            <div className="fg">
              <label className="fl">User <span className="req">*</span></label>
              <select className="fi2" value={doaForm.user_id} onChange={e => setDOAForm(f => ({ ...f, user_id: e.target.value }))}>
                <option value="">Select user…</option>
                {owners.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
              </select>
              <div className="fhint">User must be an App Owner first</div>
            </div>
            <div className="fg">
              <label className="fl">Tier</label>
              <select className="fi2" value={doaForm.tier} onChange={e => setDOAForm(f => ({ ...f, tier: e.target.value }))}>
                <option value="1">Tier 1 — CIO / COE Head</option>
                <option value="2">Tier 2 — Procurement / Other</option>
              </select>
            </div>
            <div className="fg">
              <label className="fl">Role Label</label>
              <input className="fi2" value={doaForm.role_label} onChange={e => setDOAForm(f => ({ ...f, role_label: e.target.value }))} placeholder="e.g. CIO · Tier 1" />
            </div>
          </div>
          <div className="fg">
            <label className="fl">Alert Scope</label>
            <input className="fi2" value={doaForm.alert_scope} onChange={e => setDOAForm(f => ({ ...f, alert_scope: e.target.value }))} placeholder="e.g. All · T-30+ · GxP" />
          </div>
          <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
            <button className="btn btn-p btn-sm" onClick={handleAddDOA}>Save DOA Contact</button>
            <button className="btn btn-o btn-sm" onClick={() => setShowDOAForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="tw">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>BU</th><th>Tier / Role</th><th>Alert Scope</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="6" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {doa.map(d => (
              <tr key={d.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--navy-mid)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>
                      {initials(d.user.full_name)}
                    </div>
                    <strong>{d.user.full_name}</strong>
                  </div>
                </td>
                <td style={{ fontSize: 11.5 }}>{d.user.email}</td>
                <td>{d.user.bu || "—"}</td>
                <td>{TIER_BADGE[d.tier]} <span style={{ fontSize: 11, color: "var(--tx-m)", marginLeft: 4 }}>{d.role_label || ""}</span></td>
                <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{d.alert_scope || "—"}</td>
                <td>
                  <div className="crud-actions">
                    <button className="btn btn-d btn-sm" onClick={async () => { if (window.confirm("Remove from DOA hierarchy?")) { await deleteDOA(d.id); reload(); } }}>Remove</button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && doa.length === 0 && (
              <tr><td colSpan="6" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>No DOA contacts — add one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Application Owners ─────────────────────────────────────────── */}
      <div className="sdiv">Application Owners</div>

      <div className="sr">
        <button className="btn btn-p btn-sm" onClick={() => setShowOwnerForm(v => !v)}>+ Add App Owner</button>
      </div>

      {showOwnerForm && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div className="fr3">
            <div className="fg">
              <label className="fl">Full Name <span className="req">*</span></label>
              <input className="fi2" value={ownerForm.full_name} onChange={e => setOwnerForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. J. Williams" />
            </div>
            <div className="fg">
              <label className="fl">Email <span className="req">*</span></label>
              <input className="fi2" type="email" value={ownerForm.email} onChange={e => setOwnerForm(f => ({ ...f, email: e.target.value }))} placeholder="j.williams@drl.com" />
            </div>
            <div className="fg">
              <label className="fl">BU / Dept</label>
              <input className="fi2" value={ownerForm.bu} onChange={e => setOwnerForm(f => ({ ...f, bu: e.target.value }))} placeholder="e.g. IT Ops" />
            </div>
          </div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Password <span className="req">*</span></label>
              <input className="fi2" type="password" value={ownerForm.password} onChange={e => setOwnerForm(f => ({ ...f, password: e.target.value }))} placeholder="Temporary password" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button className="btn btn-p btn-sm" onClick={handleAddOwner}>Save App Owner</button>
            <button className="btn btn-o btn-sm" onClick={() => setShowOwnerForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="tw">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>BU / Dept</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="5" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {owners.map(o => (
              <tr key={o.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--navy-mid)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>
                      {initials(o.full_name)}
                    </div>
                    <strong>{o.full_name}</strong>
                  </div>
                </td>
                <td style={{ fontSize: 11.5 }}>{o.email}</td>
                <td>{o.bu || "—"}</td>
                <td>{o.is_active ? <span className="tag tg2">Active</span> : <span className="tag tgr2">Inactive</span>}</td>
                <td>
                  <div className="crud-actions">
                    <button className="btn btn-d btn-sm" onClick={async () => { if (window.confirm("Deactivate this app owner?")) { await deactivateOwner(o.id); reload(); } }}>Deactivate</button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && owners.length === 0 && (
              <tr><td colSpan="5" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>No app owners — add one above.</td></tr>
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
cd frontend && npm run build 2>&1 | grep -E "✓|error"
```

Expected: `✓ built in`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AppOwners/AppOwnersPage.jsx
git commit -m "feat: AppOwnersPage — DOA hierarchy and app owners CRUD"
```

---

## Task 10: Verify security tests + build + route registration

- [ ] **Step 1: Run security tests**

```bash
cd backend && .venv/bin/pytest tests/test_security.py -v 2>&1 | tail -5
```

Expected: `4 passed`

- [ ] **Step 2: Verify all new routes registered**

```bash
.venv/bin/python -c "
from app.main import app
paths = sorted(set(r.path for r in app.routes if hasattr(r,'path')))
[print(p) for p in paths]
" 2>&1
```

Expected output includes:
```
/api/v1/masters/all
/api/v1/masters/categories
/api/v1/masters/discovery-sources
/api/v1/masters/metrics
/api/v1/masters/regions
/api/v1/masters/sub-categories
/api/v1/masters/usage-methods
/api/v1/masters/vendors
/api/v1/owners
/api/v1/owners/doa
```

- [ ] **Step 3: Frontend build**

```bash
cd ../frontend && npm run build 2>&1 | grep -E "✓|error"
```

Expected: `✓ built in`

- [ ] **Step 4: Final commit**

```bash
cd ..
git add -A
git commit -m "chore: Sub-project 2 Masters & App Owners complete"
```

---

## Self-Review

| Spec requirement | Task |
|---|---|
| Admin CRUD for 7 master tables | Tasks 1, 3, 7, 8 |
| All dropdowns populated from masters | Task 3 (`/masters/all`) + Task 7 (`fetchAllMasters`) |
| App Owner registry with Name, Email, BU, Region | Tasks 2, 4, 9 |
| DOA hierarchy management | Tasks 2, 4, 9 |
| Auth — COE_ADMIN required for write ops | Tasks 3, 4 (`require_role`) |
| Seed master data (categories, vendors, metrics, sources, methods, regions) | Task 5 |
| UI matches prototype Masters & Config page | Task 8 |
| UI matches prototype App Owners page | Task 9 |
