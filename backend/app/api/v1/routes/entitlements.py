import io
from datetime import date, datetime
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
from app.services.uploads.xlsx_processor import generate_template, parse_tab_a, parse_tab_b, file_hash, xls_to_xlsx
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
    from app.models.contracts import Contract
    from app.models.masters import DiscoverySource, UsageUpdateMethod, LicenseMetric, Vendor
    from app.models.users import User

    q = select(Entitlement)
    if sw_id:
        q = q.where(Entitlement.sw_id == sw_id)
    if status:
        q = q.where(Entitlement.status == status)
    if license_type:
        q = q.where(Entitlement.license_type == license_type)
    result = await db.execute(q.order_by(Entitlement.ent_id))
    ents = result.scalars().all()
    if not ents:
        return []

    # ── Bulk-load all related records (7 queries, no N+1) ────────────────────
    sw_ids       = list({e.sw_id for e in ents})
    contract_ids = list({e.contract_id for e in ents if e.contract_id})
    disc_ids     = list({e.discovery_source_id for e in ents if e.discovery_source_id})
    method_ids   = list({e.usage_method_id for e in ents if e.usage_method_id})
    owner_ids    = list({e.app_owner_id for e in ents if e.app_owner_id})
    metric_ids   = list({e.metric_id for e in ents if e.metric_id})

    sw_rows = await db.execute(
        select(SoftwareCatalog.sw_id, SoftwareCatalog.canonical_name, SoftwareCatalog.publisher)
        .where(SoftwareCatalog.sw_id.in_(sw_ids))
    )
    sw_map = {r[0]: (r[1], r[2]) for r in sw_rows}

    contracts: dict = {}
    vendor_ids: set = set()
    if contract_ids:
        c_rows = await db.execute(select(Contract).where(Contract.id.in_(contract_ids)))
        for c in c_rows.scalars():
            contracts[c.id] = c
            if c.vendor_id:
                vendor_ids.add(c.vendor_id)

    vendors: dict = {}
    if vendor_ids:
        v_rows = await db.execute(select(Vendor).where(Vendor.id.in_(list(vendor_ids))))
        for v in v_rows.scalars():
            vendors[v.id] = v.name

    disc_sources: dict = {}
    if disc_ids:
        ds_rows = await db.execute(select(DiscoverySource).where(DiscoverySource.id.in_(disc_ids)))
        for ds in ds_rows.scalars():
            disc_sources[ds.id] = ds.name

    methods: dict = {}
    if method_ids:
        m_rows = await db.execute(select(UsageUpdateMethod).where(UsageUpdateMethod.id.in_(method_ids)))
        for m in m_rows.scalars():
            methods[m.id] = m.name

    owners: dict = {}
    if owner_ids:
        u_rows = await db.execute(select(User).where(User.id.in_(list(owner_ids))))
        for u in u_rows.scalars():
            owners[u.id] = u

    metrics: dict = {}
    if metric_ids:
        met_rows = await db.execute(select(LicenseMetric).where(LicenseMetric.id.in_(list(metric_ids))))
        for m in met_rows.scalars():
            metrics[m.id] = m.name

    def _initials(name: str | None) -> str:
        if not name:
            return "?"
        return "".join(w[0] for w in name.split() if w)[:2].upper()

    out = []
    for e in ents:
        base = EntitlementOut.model_validate(e)
        sw_info = sw_map.get(e.sw_id, (None, None))
        c = contracts.get(e.contract_id) if e.contract_id else None
        owner = owners.get(e.app_owner_id) if e.app_owner_id else None
        vendor_reseller = None
        if c:
            if c.vendor_id and c.vendor_id in vendors:
                vendor_reseller = vendors[c.vendor_id]
            elif c.reseller:
                vendor_reseller = c.reseller
        out.append(base.model_copy(update={
            "canonical_name":        sw_info[0],
            "publisher":             sw_info[1],
            "metric_name":           metrics.get(e.metric_id) if e.metric_id else None,
            "po_number":             c.po_number if c else None,
            "clm_id":                c.clm_id if c else None,
            "start_date":            c.start_date if c else None,
            "end_date":              c.end_date if c else None,
            "vendor_reseller":       vendor_reseller,
            "discovery_source_name": disc_sources.get(e.discovery_source_id) if e.discovery_source_id else None,
            "usage_method_name":     methods.get(e.usage_method_id) if e.usage_method_id else None,
            "app_owner_name":        owner.full_name if owner else None,
            "app_owner_initials":    _initials(owner.full_name if owner else None),
        }))
    return out


@router.get("/template")
async def download_template():
    # Headers-only blank template — no pre-populated data rows
    xlsx_bytes = generate_template([])
    today = date.today().isoformat()
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=entitlements_template_{today}.xlsx"},
    )


@router.get("/{ent_id}", response_model=EntitlementOut)
async def get_entitlement(ent_id: str, db: AsyncSession = Depends(get_db)):
    ent = await db.get(Entitlement, ent_id)
    if not ent:
        raise HTTPException(status_code=404, detail="Entitlement not found")
    return EntitlementOut.model_validate(ent)


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


@router.post("/upload", response_model=UploadResultOut, status_code=201)
async def upload_usage(
    file: UploadFile = File(...),
    reporting_period: str | None = Query(None),
    reason: str | None = Query(None),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fname = (file.filename or "").lower()
    if not fname.endswith(".xlsx") and not fname.endswith(".xls"):
        raise HTTPException(status_code=400, detail="Upload must be a .xlsx or .xls file")

    data = await file.read()
    if fname.endswith(".xls"):
        data = xls_to_xlsx(data)   # normalise legacy format before parsing
    fhash = file_hash(data)
    errors: list[str] = []
    tab_a_count = 0
    tab_b_count = 0

    # Parse Tab A — applies all non-null editable fields
    try:
        tab_a_rows = parse_tab_a(data)
        for row in tab_a_rows:
            ent = await db.get(Entitlement, row["ent_id"])
            if not ent:
                errors.append(f"Tab A: ENT_ID {row['ent_id']} not found — skipped")
                continue
            for k, v in row.items():
                if k != "ent_id" and v is not None:
                    setattr(ent, k, v)
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

    # Upload file to storage (best-effort — don't fail the whole request if storage is down)
    storage = get_storage_backend()
    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%S")
    storage_path = f"uploads/{current_user.id}/{ts}_{file.filename}"
    try:
        await storage.upload(
            data, storage_path,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except Exception:
        storage_path = f"local/{ts}_{file.filename}"

    # Create usage_upload record
    upload_rec = UsageUpload(
        user_id=current_user.id,
        file_name=file.filename,
        file_hash=fhash,
        file_path=storage_path,
        storage_backend="supabase",
        reporting_period=reporting_period,
        reason=reason,
        processed_at=datetime.utcnow(),
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
