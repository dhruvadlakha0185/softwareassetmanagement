from uuid import UUID
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.api.deps import require_role
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
    # Build manually to avoid triggering the lazy-loaded ORM relationship
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
