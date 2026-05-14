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
