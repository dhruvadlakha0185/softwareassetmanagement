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
    SoftwareCatalogRow, SoftwareCatalogDetail, EntitlementSummary,
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


# ── Enriched helpers ──────────────────────────────────────────────────────────

def _initials(name: str | None) -> str:
    if not name:
        return "?"
    return "".join(w[0] for w in name.split() if w)[:2].upper()


async def _enrich_row(sw: SoftwareCatalog, db: AsyncSession) -> SoftwareCatalogRow:
    from app.models.masters import Category, SubCategory, Region
    from app.models.users import User
    from app.models.contracts import Entitlement
    from app.models.masters import LicenseMetric

    cat = await db.get(Category, sw.category_id) if sw.category_id else None
    sub = await db.get(SubCategory, sw.sub_category_id) if sw.sub_category_id else None
    region = await db.get(Region, sw.region_id) if sw.region_id else None
    owner = await db.get(User, sw.app_owner_id) if sw.app_owner_id else None

    # First entitlement for license_type + metric
    ent_q = await db.execute(
        select(Entitlement).where(Entitlement.sw_id == sw.sw_id).limit(1)
    )
    ent = ent_q.scalar_one_or_none()
    license_type = ent.license_type if ent else None
    metric_name = None
    if ent and ent.metric_id:
        metric = await db.get(LicenseMetric, ent.metric_id)
        metric_name = metric.name if metric else None

    aliases_result = await db.execute(
        select(SoftwareAlias).where(SoftwareAlias.sw_id == sw.sw_id)
    )
    aliases = [SoftwareAliasOut.model_validate(a) for a in aliases_result.scalars().all()]

    return SoftwareCatalogRow(
        sw_id=sw.sw_id,
        canonical_name=sw.canonical_name,
        publisher=sw.publisher,
        category_name=cat.name if cat else None,
        sub_category_name=sub.name if sub else None,
        gxp_flag=sw.gxp_flag,
        vendor_risk=sw.vendor_risk,
        license_type=license_type,
        metric_name=metric_name,
        deployment=sw.deployment,
        region_name=region.name if region else None,
        app_owner_name=owner.full_name if owner else None,
        app_owner_initials=_initials(owner.full_name if owner else None),
        onboarded_date=sw.onboarded_date,
        notes=sw.notes,
        aliases=aliases,
    )


# ── New enriched list endpoint ────────────────────────────────────────────────

@router.get("/rows", response_model=list[SoftwareCatalogRow])
async def list_catalog_rows(
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
    return [await _enrich_row(sw, db) for sw in rows]


# ── Detail panel endpoint ─────────────────────────────────────────────────────

@router.get("/{sw_id}/detail", response_model=SoftwareCatalogDetail)
async def get_catalog_detail(sw_id: str, db: AsyncSession = Depends(get_db)):
    from app.models.masters import Category, SubCategory, Region, LicenseMetric
    from app.models.users import User
    from app.models.contracts import Entitlement, Contract

    sw = await db.get(SoftwareCatalog, sw_id)
    if not sw:
        raise HTTPException(status_code=404, detail="Software entry not found")

    cat = await db.get(Category, sw.category_id) if sw.category_id else None
    sub = await db.get(SubCategory, sw.sub_category_id) if sw.sub_category_id else None
    region = await db.get(Region, sw.region_id) if sw.region_id else None
    owner = await db.get(User, sw.app_owner_id) if sw.app_owner_id else None

    aliases_result = await db.execute(
        select(SoftwareAlias).where(SoftwareAlias.sw_id == sw.sw_id)
    )
    aliases = [SoftwareAliasOut.model_validate(a) for a in aliases_result.scalars().all()]

    # All entitlements for this SW
    ents_result = await db.execute(
        select(Entitlement).where(Entitlement.sw_id == sw.sw_id)
    )
    ents = ents_result.scalars().all()

    ent_summaries = []
    for ent in ents:
        metric = await db.get(LicenseMetric, ent.metric_id) if ent.metric_id else None
        contract = await db.get(Contract, ent.contract_id) if ent.contract_id else None
        entitled = ent.entitled_count or 0
        in_use = ent.in_use_count or 0
        util_pct = round(in_use / entitled * 100, 1) if entitled > 0 else None
        ent_summaries.append(EntitlementSummary(
            ent_id=ent.ent_id,
            contract_name=ent.contract_name,
            license_type=ent.license_type,
            metric_name=metric.name if metric else None,
            entitled_count=ent.entitled_count,
            in_use_count=in_use,
            util_pct=util_pct,
            unit_cost_inr=ent.unit_cost_inr,
            annual_cost_inr=ent.annual_cost_inr,
            status=ent.status,
            po_number=contract.po_number if contract else None,
            clm_id=contract.clm_id if contract else None,
            start_date=contract.start_date if contract else None,
            end_date=contract.end_date if contract else None,
            auto_renewal_clause=contract.auto_renewal_clause if contract else None,
            is_archived=contract.is_archived if contract else False,
            archived_path=contract.archived_path if contract else None,
        ))

    return SoftwareCatalogDetail(
        sw_id=sw.sw_id,
        canonical_name=sw.canonical_name,
        publisher=sw.publisher,
        category_name=cat.name if cat else None,
        sub_category_name=sub.name if sub else None,
        gxp_flag=sw.gxp_flag,
        vendor_risk=sw.vendor_risk,
        deployment=sw.deployment,
        region_name=region.name if region else None,
        app_owner_name=owner.full_name if owner else None,
        app_owner_initials=_initials(owner.full_name if owner else None),
        notes=sw.notes,
        onboarded_date=sw.onboarded_date,
        aliases=aliases,
        entitlements=ent_summaries,
    )
