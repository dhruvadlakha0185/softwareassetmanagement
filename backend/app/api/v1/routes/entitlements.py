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
    ents = result.scalars().all()

    # Bulk-load software names (one query, no N+1)
    if ents:
        sw_ids = list({e.sw_id for e in ents})
        sw_rows = await db.execute(
            select(SoftwareCatalog.sw_id, SoftwareCatalog.canonical_name)
            .where(SoftwareCatalog.sw_id.in_(sw_ids))
        )
        sw_name_map = {r[0]: r[1] for r in sw_rows}
    else:
        sw_name_map = {}

    out = []
    for e in ents:
        base = EntitlementOut.model_validate(e)
        out.append(EntitlementOut(**base.model_dump(), canonical_name=sw_name_map.get(e.sw_id)))
    return out


@router.get("/template")
async def download_template(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Entitlement).order_by(Entitlement.ent_id))
    ents = result.scalars().all()

    from app.models.contracts import Contract
    rows = []
    for ent in ents:
        sw = await db.get(SoftwareCatalog, ent.sw_id)
        metric = await db.get(LicenseMetric, ent.metric_id) if ent.metric_id else None
        contract = await db.get(Contract, ent.contract_id) if ent.contract_id else None
        rows.append({
            "ent_id":          ent.ent_id,
            "sw_id":           ent.sw_id,
            "canonical_name":  sw.canonical_name if sw else "",
            "metric_name":     metric.name if metric else "",
            "status":          ent.status,
            "po_number":       contract.po_number if contract else "",
            "contract_name":   ent.contract_name or "",
            "license_type":    ent.license_type,
            "entitled_count":  ent.entitled_count,
            "unit_cost_inr":   ent.unit_cost_inr,
            "annual_cost_inr": ent.annual_cost_inr,
            "in_use_count":    ent.in_use_count,
            "notes":           None,
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
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Upload must be an .xlsx file")

    data = await file.read()
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
