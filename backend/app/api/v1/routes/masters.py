from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.api.deps import require_role
from app.models.masters import (
    Category, SubCategory, Vendor, LicenseMetric,
    DiscoverySource, UsageUpdateMethod, Region,
)
from app.schemas.masters import (
    CategoryCreate, CategoryOut,
    SubCategoryCreate, SubCategoryOut,
    VendorCreate, VendorOut,
    MetricCreate, MetricOut,
    DiscoverySourceCreate, DiscoverySourceOut,
    UsageMethodCreate, UsageMethodOut,
    RegionCreate, RegionOut,
    AllMastersOut,
)

router = APIRouter(prefix="/masters", tags=["masters"])
admin_only = Depends(require_role(["COE_ADMIN"]))


# ── All masters (dropdown population) ────────────────────────────────────────
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
    # Reload with sub_categories eagerly to avoid lazy-load MissingGreenlet error
    result = await db.execute(select(Category).options(selectinload(Category.sub_categories)).where(Category.id == cat.id))
    return CategoryOut.model_validate(result.scalar_one())


@router.put("/categories/{cat_id}", response_model=CategoryOut, dependencies=[admin_only])
async def update_category(cat_id: UUID, body: CategoryCreate, db: AsyncSession = Depends(get_db)):
    cat = await db.get(Category, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    for k, v in body.model_dump().items():
        setattr(cat, k, v)
    await db.commit()
    result = await db.execute(select(Category).options(selectinload(Category.sub_categories)).where(Category.id == cat_id))
    return CategoryOut.model_validate(result.scalar_one())


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
