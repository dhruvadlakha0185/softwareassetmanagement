import io
from uuid import UUID
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.api.deps import get_current_user, require_role
from app.models.catalog import SoftwareCatalog, SoftwareAlias
from app.models.contracts import Contract, Entitlement, OnboardingDraft
from app.schemas.onboarding import DraftSave, DraftOut, PublishPayload, PublishOut
from app.services.ai.contract_extractor import extract_contract_text, call_openai

router = APIRouter(prefix="/onboarding", tags=["onboarding"])
auth = Depends(get_current_user)


async def _next_sw_id(db: AsyncSession) -> str:
    result = await db.execute(
        select(func.max(SoftwareCatalog.sw_id)).where(SoftwareCatalog.sw_id.like("SW-%"))
    )
    max_id = result.scalar_one_or_none()
    n = int(max_id.split("-")[1]) + 1 if max_id else 1
    return f"SW-{n:03d}"


async def _next_ent_id(db: AsyncSession) -> str:
    result = await db.execute(
        select(func.max(Entitlement.ent_id)).where(Entitlement.ent_id.like("ENT-%"))
    )
    max_id = result.scalar_one_or_none()
    n = int(max_id.split("-")[1]) + 1 if max_id else 1
    return f"ENT-{n:03d}"


# ── AI Extraction ──────────────────────────────────────────────────────────────

@router.post("/extract")
async def extract_contract(
    file: UploadFile = File(...),
    current_user=auth,
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    data = await file.read()
    try:
        text = extract_contract_text(file.filename, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    result = await call_openai(text)
    return result


# ── Drafts ─────────────────────────────────────────────────────────────────────

@router.get("/drafts", response_model=list[DraftOut])
async def list_drafts(current_user=auth, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(OnboardingDraft).where(OnboardingDraft.user_id == current_user.id)
    )
    return [DraftOut.model_validate(d) for d in result.scalars().all()]


@router.post("/drafts", response_model=DraftOut, status_code=201)
async def create_draft(
    body: DraftSave,
    current_user=auth,
    db: AsyncSession = Depends(get_db),
):
    draft = OnboardingDraft(user_id=current_user.id, **body.model_dump())
    db.add(draft)
    await db.commit()
    await db.refresh(draft)
    return DraftOut.model_validate(draft)


@router.get("/drafts/{draft_id}", response_model=DraftOut)
async def get_draft(
    draft_id: UUID,
    current_user=auth,
    db: AsyncSession = Depends(get_db),
):
    draft = await db.get(OnboardingDraft, draft_id)
    if not draft or draft.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    return DraftOut.model_validate(draft)


@router.put("/drafts/{draft_id}", response_model=DraftOut)
async def update_draft(
    draft_id: UUID,
    body: DraftSave,
    current_user=auth,
    db: AsyncSession = Depends(get_db),
):
    draft = await db.get(OnboardingDraft, draft_id)
    if not draft or draft.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(draft, k, v)
    await db.commit()
    await db.refresh(draft)
    return DraftOut.model_validate(draft)


@router.delete("/drafts/{draft_id}", status_code=204)
async def delete_draft(
    draft_id: UUID,
    current_user=auth,
    db: AsyncSession = Depends(get_db),
):
    draft = await db.get(OnboardingDraft, draft_id)
    if not draft or draft.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    await db.delete(draft)
    await db.commit()


# ── Publish ────────────────────────────────────────────────────────────────────

@router.post("/publish", response_model=PublishOut, status_code=201)
async def publish_onboarding(
    body: PublishPayload,
    current_user=auth,
    db: AsyncSession = Depends(get_db),
):
    # Resolve or create SW catalog entry
    if body.sw_id:
        sw = await db.get(SoftwareCatalog, body.sw_id)
        if not sw:
            raise HTTPException(status_code=404, detail=f"SW entry {body.sw_id} not found")
        sw_id = body.sw_id
    else:
        existing = (await db.execute(
            select(SoftwareCatalog).where(SoftwareCatalog.canonical_name == body.canonical_name)
        )).scalar_one_or_none()
        if existing:
            sw_id = existing.sw_id
        else:
            sw_id = await _next_sw_id(db)
            sw = SoftwareCatalog(
                sw_id=sw_id,
                canonical_name=body.canonical_name,
                publisher=body.publisher,
                category_id=body.category_id,
                sub_category_id=body.sub_category_id,
                gxp_flag=body.gxp_flag,
                vendor_id=body.vendor_id,
                vendor_risk=body.vendor_risk,
                deployment=body.deployment,
                region_id=body.region_id,
                app_owner_id=body.app_owner_id,
                notes=body.notes,
                onboarded_date=date.today(),
                created_by=current_user.id,
            )
            db.add(sw)
            await db.flush()

    # Add aliases (Step 6)
    for alias_name in body.aliases:
        existing_alias = (await db.execute(
            select(SoftwareAlias).where(
                SoftwareAlias.sw_id == sw_id,
                SoftwareAlias.alias_name == alias_name,
            )
        )).scalar_one_or_none()
        if not existing_alias:
            db.add(SoftwareAlias(sw_id=sw_id, alias_name=alias_name, source_name="onboarding"))

    # Create contract record
    contract = Contract(
        sw_id=sw_id,
        po_number=body.po_number,
        clm_id=body.clm_id,
        vendor_id=body.vendor_id,
        reseller=body.reseller,
        start_date=body.start_date,
        end_date=body.end_date,
        total_value_inr=body.total_value_inr,
        auto_renewal_clause=body.auto_renewal_clause,
        file_name=body.file_name,
        file_path=body.file_path,
        storage_backend="supabase",
        created_by=current_user.id,
    )
    db.add(contract)
    await db.flush()

    # Create entitlement for each line item
    ent_ids = []
    for item in body.line_items:
        ent_id = await _next_ent_id(db)
        ent = Entitlement(
            ent_id=ent_id,
            sw_id=sw_id,
            contract_id=contract.id,
            contract_name=item.contract_name,
            license_type=item.license_type,
            entitled_count=item.entitled_count,
            unit_cost_inr=item.unit_cost_inr,
            annual_cost_inr=item.annual_cost_inr,
            region_id=item.region_id,
            discovery_source_id=item.discovery_source_id,
            usage_method_id=item.usage_method_id,
            app_owner_id=item.app_owner_id,
            status="ACTIVE",
        )
        db.add(ent)
        ent_ids.append(ent_id)

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


# ── Bulk Onboarding ───────────────────────────────────────────────────────────

def _generate_bulk_template() -> bytes:
    """Blank XLSX template for bulk software onboarding."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    wb = Workbook()
    ws = wb.active
    ws.title = "Bulk Onboarding"

    headers = [
        "Software Name *",        "SW_ID (leave blank=new)",
        "Publisher",               "Category",
        "Deployment",              "GxP Relevant (yes/no)",
        "Vendor Risk (LOW/MEDIUM/HIGH)", "Notes",
        "Contract Name *",         "PO Number",
        "CLM ID",                  "Start Date (YYYY-MM-DD)",
        "End Date (YYYY-MM-DD)",   "Total Value (INR)",
        "Auto-Renewal (yes/no/opt_in)", "License Type (subscription/perpetual)",
        "Metric",                  "Entitled Count",
        "Unit Cost (INR)",         "Annual Cost (INR)",
    ]

    navy_fill = PatternFill("solid", fgColor="1A2E5A")
    navy_font = Font(color="FFFFFF", bold=True, size=10)
    req_fill  = PatternFill("solid", fgColor="2E4A7A")  # slightly lighter for * cols

    ws.append(headers)
    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = req_fill if "*" in header else navy_fill
        cell.font = navy_font
        cell.alignment = Alignment(horizontal="center")
        ws.column_dimensions[cell.column_letter].width = max(len(header) + 4, 18)

    # Example row
    example = [
        "SAP Concur Travel", "", "SAP SE", "Finance & Operations",
        "cloud", "no", "MEDIUM", "Travel expense management",
        "SAP Concur FY26", "PO-2026-100", "CLM-2026-001",
        "2026-04-01", "2027-03-31", "2500000",
        "yes", "subscription", "Per User", "250", "8000", "2000000",
    ]
    ws.append(example)
    for col_idx in range(1, len(example) + 1):
        ws.cell(row=2, column=col_idx).font = Font(italic=True, color="888888", size=9)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _parse_bulk_xlsx(data: bytes) -> list[dict]:
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb.active
    all_rows = list(ws.iter_rows(values_only=True))
    if not all_rows:
        return []
    raw_headers = [str(h).strip() if h else f"col{i}" for i, h in enumerate(all_rows[0])]
    # Normalise headers to simple keys
    key_map = {
        "Software Name *": "canonical_name",
        "SW_ID (leave blank=new)": "sw_id",
        "Publisher": "publisher",
        "Category": "category_name",
        "Deployment": "deployment",
        "GxP Relevant (yes/no)": "gxp",
        "Vendor Risk (LOW/MEDIUM/HIGH)": "vendor_risk",
        "Notes": "notes",
        "Contract Name *": "contract_name",
        "PO Number": "po_number",
        "CLM ID": "clm_id",
        "Start Date (YYYY-MM-DD)": "start_date",
        "End Date (YYYY-MM-DD)": "end_date",
        "Total Value (INR)": "total_value_inr",
        "Auto-Renewal (yes/no/opt_in)": "auto_renewal",
        "License Type (subscription/perpetual)": "license_type",
        "Metric": "metric",
        "Entitled Count": "entitled_count",
        "Unit Cost (INR)": "unit_cost_inr",
        "Annual Cost (INR)": "annual_cost_inr",
    }
    keys = [key_map.get(h, h.lower().replace(" ", "_")) for h in raw_headers]
    result = []
    for row in all_rows[1:]:
        if not row or all(c is None or str(c).strip() == "" for c in row):
            continue
        d = {keys[i]: (str(row[i]).strip() if row[i] is not None else "") for i in range(min(len(keys), len(row)))}
        if not d.get("canonical_name") or not d.get("contract_name"):
            continue  # skip rows missing required fields
        result.append(d)
    return result


@router.get("/bulk-template")
async def download_bulk_template():
    data = _generate_bulk_template()
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=DRL_BulkOnboarding_Template.xlsx"},
    )


@router.post("/bulk", status_code=201)
async def bulk_onboard(
    file: UploadFile = File(...),
    current_user=Depends(require_role(["COE_ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Process bulk onboarding XLSX. Each row creates a SoftwareCatalog entry
    (or maps to existing), a Contract, and an Entitlement. Returns a summary.
    """
    from datetime import datetime as _dt
    from app.models.masters import Category, LicenseMetric

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    data = await file.read()
    rows = _parse_bulk_xlsx(data)
    if not rows:
        raise HTTPException(status_code=400, detail="No valid rows found. Check that Software Name and Contract Name columns are filled.")

    created_sw: list[str] = []
    created_ent: list[str] = []
    skipped: list[str] = []

    for idx, row in enumerate(rows, 1):
        try:
            canonical = row["canonical_name"]
            contract_name = row["contract_name"]

            # ── Resolve SW_ID ──────────────────────────────────────────────
            sw_id_input = row.get("sw_id", "").strip()
            if sw_id_input:
                sw = await db.get(SoftwareCatalog, sw_id_input)
                if not sw:
                    skipped.append(f"Row {idx}: SW_ID '{sw_id_input}' not found — skipped")
                    continue
                sw_id = sw.sw_id
            else:
                # Check if canonical name already exists
                existing = (await db.execute(
                    select(SoftwareCatalog).where(SoftwareCatalog.canonical_name == canonical)
                )).scalar_one_or_none()
                if existing:
                    sw_id = existing.sw_id
                else:
                    # Create new SW entry
                    max_sw = (await db.execute(
                        select(func.max(SoftwareCatalog.sw_id)).where(SoftwareCatalog.sw_id.like("SW-%"))
                    )).scalar_one_or_none()
                    n = int(max_sw.split("-")[1]) + 1 if max_sw else 1
                    # Find used SW-IDs to avoid sequence gaps causing duplicates
                    while True:
                        candidate = f"SW-{n:03d}"
                        existing_check = await db.get(SoftwareCatalog, candidate)
                        if not existing_check:
                            sw_id = candidate
                            break
                        n += 1

                    gxp_raw = row.get("gxp", "no").lower()
                    gxp_flag = "yes_21cfr" if gxp_raw == "yes" else "no"
                    vendor_risk = row.get("vendor_risk", "LOW").upper()
                    if vendor_risk not in ("LOW", "MEDIUM", "HIGH"):
                        vendor_risk = "LOW"
                    deploy = row.get("deployment", "cloud").lower().replace(" ", "_").replace("/", "_")
                    if deploy not in ("cloud", "on_premise", "desktop_cloud", "hybrid"):
                        deploy = "cloud"

                    # Resolve category by name
                    cat_name = row.get("category_name", "").strip()
                    cat_id = None
                    if cat_name:
                        cat = (await db.execute(
                            select(Category).where(Category.name.ilike(cat_name))
                        )).scalar_one_or_none()
                        if cat:
                            cat_id = cat.id

                    sw_entry = SoftwareCatalog(
                        sw_id=sw_id,
                        canonical_name=canonical,
                        publisher=row.get("publisher") or None,
                        category_id=cat_id,
                        gxp_flag=gxp_flag,
                        vendor_risk=vendor_risk,
                        deployment=deploy,
                        notes=row.get("notes") or None,
                        onboarded_date=date.today(),
                    )
                    db.add(sw_entry)
                    await db.flush()
                    created_sw.append(sw_id)

            # ── Parse dates ────────────────────────────────────────────────
            def _d(s):
                if not s:
                    return None
                try:
                    return _dt.strptime(s.strip(), "%Y-%m-%d").date()
                except (ValueError, AttributeError):
                    return None

            # ── Create Contract ────────────────────────────────────────────
            auto_r = row.get("auto_renewal", "").lower()
            if auto_r not in ("yes", "no", "opt_in"):
                auto_r = None

            contract = Contract(
                sw_id=sw_id,
                po_number=row.get("po_number") or None,
                clm_id=row.get("clm_id") or None,
                start_date=_d(row.get("start_date")),
                end_date=_d(row.get("end_date")),
                total_value_inr=int(row["total_value_inr"]) if row.get("total_value_inr") else None,
                auto_renewal_clause=auto_r,
                storage_backend="local",
                created_by=current_user.id,
            )
            db.add(contract)
            await db.flush()

            # ── Resolve metric ─────────────────────────────────────────────
            metric_name = row.get("metric", "").strip()
            metric_id = None
            if metric_name:
                metric = (await db.execute(
                    select(LicenseMetric).where(LicenseMetric.name.ilike(metric_name))
                )).scalar_one_or_none()
                if metric:
                    metric_id = metric.id

            # ── Create Entitlement ─────────────────────────────────────────
            max_ent = (await db.execute(
                select(func.max(Entitlement.ent_id)).where(Entitlement.ent_id.like("ENT-%"))
            )).scalar_one_or_none()
            ent_n = int(max_ent.split("-")[1]) + 1 if max_ent else 1
            while True:
                ent_candidate = f"ENT-{ent_n:03d}"
                existing_ent = await db.get(Entitlement, ent_candidate)
                if not existing_ent:
                    ent_id = ent_candidate
                    break
                ent_n += 1

            lic_type = row.get("license_type", "subscription").lower()
            if lic_type not in ("subscription", "perpetual"):
                lic_type = "subscription"

            ent = Entitlement(
                ent_id=ent_id,
                sw_id=sw_id,
                contract_id=contract.id,
                contract_name=contract_name,
                metric_id=metric_id,
                license_type=lic_type,
                entitled_count=int(row["entitled_count"]) if row.get("entitled_count") else None,
                in_use_count=0,
                unit_cost_inr=int(row["unit_cost_inr"]) if row.get("unit_cost_inr") else None,
                annual_cost_inr=int(row["annual_cost_inr"]) if row.get("annual_cost_inr") else None,
                status="ACTIVE",
            )
            db.add(ent)
            await db.flush()
            created_ent.append(ent_id)

        except Exception as e:
            skipped.append(f"Row {idx} ({row.get('canonical_name','?')}): {e}")

    await db.commit()
    return {
        "sw_created": len(created_sw),
        "ent_created": len(created_ent),
        "sw_ids": created_sw,
        "ent_ids": created_ent,
        "skipped": skipped,
    }
