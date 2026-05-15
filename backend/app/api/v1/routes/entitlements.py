import io
from datetime import date, datetime
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.api.deps import get_current_user, require_role
from app.models.contracts import Entitlement
from app.models.catalog import SoftwareCatalog
from app.models.masters import LicenseMetric
from app.models.uploads import UsageUpload
from app.schemas.entitlements import EntitlementOut, EntitlementUpdate, UploadResultOut, RenewEntitlementRequest, RenewEntitlementOut
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


@router.post("/{ent_id}/renew", response_model=RenewEntitlementOut, status_code=201)
async def renew_entitlement(
    ent_id: str,
    contract_name:        str           = Form(...),
    po_number:            str | None    = Form(None),
    clm_id:               str | None    = Form(None),
    start_date:           str | None    = Form(None),   # ISO date string
    end_date:             str | None    = Form(None),
    total_value_inr:      int | None    = Form(None),
    auto_renewal_clause:  str | None    = Form(None),
    entitled_count:       int | None    = Form(None),
    unit_cost_inr:        int | None    = Form(None),
    annual_cost_inr:      int | None    = Form(None),
    notes:                str | None    = Form(None),
    contract_file:        UploadFile | None = File(None),
    current_user=Depends(require_role(["COE_ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Renew a contract cycle (multipart/form-data — supports optional PDF/DOCX upload):
      1. Upload contract document to storage (if provided)
      2. Create a new SW_ID (copy of existing catalog entry, today as onboarded_date)
      3. Create a new Contract record (with file_path if uploaded)
      4. Create a new Entitlement (new ENT_ID, new SW_ID, renewal_of = old ent_id)
      5. Mark old entitlement EXPIRED
    History is preserved — old ENT_ID stays in the register with EXPIRED status.
    """
    from sqlalchemy import func
    from app.models.contracts import Contract
    from datetime import date as date_type

    old_ent = await db.get(Entitlement, ent_id)
    if not old_ent:
        raise HTTPException(status_code=404, detail="Entitlement not found")

    old_sw = await db.get(SoftwareCatalog, old_ent.sw_id)
    if not old_sw:
        raise HTTPException(status_code=404, detail="Software catalog entry not found")

    # ── 0. Upload contract document (optional) ───────────────────────────────
    file_path_stored: str | None = None
    file_name_stored: str | None = None
    if contract_file and contract_file.filename:
        file_data = await contract_file.read()
        ts = datetime.utcnow().strftime("%Y%m%dT%H%M%S")
        storage_key = f"contracts/renewals/{ent_id}/{ts}_{contract_file.filename}"
        try:
            storage = get_storage_backend()
            await storage.upload(file_data, storage_key, contract_file.content_type or "application/octet-stream")
            file_path_stored = storage_key
            file_name_stored = contract_file.filename
        except Exception:
            file_path_stored = f"local/{ts}_{contract_file.filename}"
            file_name_stored = contract_file.filename

    # Parse ISO date strings
    def _parse_date(s: str | None):
        if not s:
            return None
        try:
            return date_type.fromisoformat(s)
        except ValueError:
            return None

    # ── 1. New SW_ID ──────────────────────────────────────────────────────────
    max_sw = (await db.execute(
        select(func.max(SoftwareCatalog.sw_id)).where(SoftwareCatalog.sw_id.like("SW-%"))
    )).scalar_one_or_none()
    new_sw_n = int(max_sw.split("-")[1]) + 1 if max_sw else 1
    new_sw_id = f"SW-{new_sw_n:03d}"

    new_sw = SoftwareCatalog(
        sw_id=new_sw_id,
        canonical_name=old_sw.canonical_name,
        publisher=old_sw.publisher,
        category_id=old_sw.category_id,
        sub_category_id=old_sw.sub_category_id,
        gxp_flag=old_sw.gxp_flag,
        vendor_id=old_sw.vendor_id,
        vendor_risk=old_sw.vendor_risk,
        deployment=old_sw.deployment,
        region_id=old_sw.region_id,
        app_owner_id=old_sw.app_owner_id,
        notes=old_sw.notes,
        onboarded_date=date.today(),
    )
    db.add(new_sw)

    # ── 2. New Contract ───────────────────────────────────────────────────────
    new_contract = Contract(
        sw_id=new_sw_id,
        po_number=po_number,
        clm_id=clm_id,
        start_date=_parse_date(start_date),
        end_date=_parse_date(end_date),
        total_value_inr=total_value_inr,
        auto_renewal_clause=auto_renewal_clause,
        file_name=file_name_stored,
        file_path=file_path_stored,
        storage_backend="supabase" if file_path_stored and not file_path_stored.startswith("local/") else "local",
        created_by=current_user.id,
    )
    db.add(new_contract)
    await db.flush()  # needed to get new_contract.id

    # ── 3. New ENT_ID ─────────────────────────────────────────────────────────
    max_ent = (await db.execute(
        select(func.max(Entitlement.ent_id)).where(Entitlement.ent_id.like("ENT-%"))
    )).scalar_one_or_none()
    new_ent_n = int(max_ent.split("-")[1]) + 1 if max_ent else 1
    new_ent_id = f"ENT-{new_ent_n:03d}"

    new_ent = Entitlement(
        ent_id=new_ent_id,
        sw_id=new_sw_id,
        contract_id=new_contract.id,
        contract_name=contract_name,
        metric_id=old_ent.metric_id,
        license_type=old_ent.license_type,
        entitled_count=entitled_count if entitled_count is not None else old_ent.entitled_count,
        in_use_count=0,
        unit_cost_inr=unit_cost_inr,
        annual_cost_inr=annual_cost_inr,
        region_id=old_ent.region_id,
        discovery_source_id=old_ent.discovery_source_id,
        usage_method_id=old_ent.usage_method_id,
        app_owner_id=old_ent.app_owner_id,
        status="ACTIVE",
        renewal_of=ent_id,
    )
    db.add(new_ent)

    # ── 4. Retire old entitlement ─────────────────────────────────────────────
    old_ent.status = "EXPIRED"

    from app.services.audit_logger import log_event
    await log_event(
        db, current_user.id, "ENTITLEMENT_RENEWED", "entitlement", new_ent_id,
        sw_id=new_sw_id,
        before={"ent_id": ent_id, "sw_id": old_ent.sw_id},
        after={"new_ent_id": new_ent_id, "new_sw_id": new_sw_id, "contract_name": contract_name, "file_uploaded": bool(file_name_stored)},
        is_gxp=(old_sw.gxp_flag != "no"),
    )

    await db.commit()
    return RenewEntitlementOut(
        new_ent_id=new_ent_id,
        new_sw_id=new_sw_id,
        retired_ent_id=ent_id,
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

    # ── Lookup helper: ENT_ID primary, SW_ID fallback ────────────────────────
    async def _find_ent(ent_id: str | None, sw_id: str | None, ctx: str):
        """
        Resolve entitlement row by ENT_ID (primary) or SW_ID (fallback).
        - ENT_ID provided → direct get; if SW_ID also given, validates the match.
        - ENT_ID blank, SW_ID provided → lookup by SW_ID (error if multiple).
        - Both blank → returns None silently (blank row).
        """
        ent_id = (ent_id or "").strip()
        sw_id  = (sw_id  or "").strip()

        if ent_id:
            ent = await db.get(Entitlement, ent_id)
            if not ent:
                errors.append(f"{ctx}: ENT_ID {ent_id!r} not found — skipped")
                return None
            if sw_id and ent.sw_id != sw_id:
                errors.append(f"{ctx}: ENT_ID {ent_id} belongs to SW_ID {ent.sw_id}, not {sw_id!r} — skipped")
                return None
            return ent

        if sw_id:
            res = await db.execute(select(Entitlement).where(Entitlement.sw_id == sw_id))
            matches = res.scalars().all()
            if not matches:
                errors.append(f"{ctx}: SW_ID {sw_id!r} has no entitlements — skipped")
                return None
            if len(matches) > 1:
                errors.append(f"{ctx}: SW_ID {sw_id!r} has {len(matches)} entitlements — provide ENT_ID to disambiguate")
                return None
            return matches[0]

        return None  # blank row, skip silently

    # Fields that identify the row — never written back to the model
    _LOOKUP_FIELDS = {"ent_id", "sw_id"}

    # Parse Tab A — applies all non-null editable fields
    try:
        tab_a_rows = parse_tab_a(data)
        for row in tab_a_rows:
            ent = await _find_ent(row.get("ent_id"), row.get("sw_id"), "Tab A")
            if not ent:
                continue
            for k, v in row.items():
                if k not in _LOOKUP_FIELDS and v is not None:
                    setattr(ent, k, v)
            tab_a_count += 1
    except Exception as e:
        errors.append(f"Tab A parse error: {e}")

    # Parse Tab B — updates in_use_count only
    try:
        tab_b_rows = parse_tab_b(data)
        for row in tab_b_rows:
            ent = await _find_ent(row.get("ent_id"), row.get("sw_id"), "Tab B")
            if not ent:
                continue
            if row.get("in_use_count") is not None:
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
