from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.api.deps import require_role
from app.models.reconciliation import ReconciliationRun, ReconciliationResult
from app.schemas.reconciliation import ReconRunOut, ReconResultOut, ReconRunWithResults
from app.services.reconciliation_engine import run_reconciliation

router = APIRouter(prefix="/reconciliation", tags=["reconciliation"])


async def _enrich(raw: list, db: AsyncSession) -> list[ReconResultOut]:
    """Bulk-resolve sw_id, canonical_name, publisher, category, metric, region for results."""
    if not raw:
        return []
    from app.models.contracts import Entitlement
    from app.models.catalog import SoftwareCatalog
    from app.models.masters import Category, LicenseMetric, Region

    ent_ids = [r.ent_id for r in raw]
    ents_q  = await db.execute(select(Entitlement).where(Entitlement.ent_id.in_(ent_ids)))
    ent_map = {e.ent_id: e for e in ents_q.scalars()}

    sw_ids = list({e.sw_id for e in ent_map.values()})
    sw_q   = await db.execute(select(SoftwareCatalog).where(SoftwareCatalog.sw_id.in_(sw_ids)))
    sw_map = {sw.sw_id: sw for sw in sw_q.scalars()}

    cat_ids = list({sw.category_id for sw in sw_map.values() if sw.category_id})
    cat_map: dict = {}
    if cat_ids:
        cat_q = await db.execute(select(Category).where(Category.id.in_(cat_ids)))
        for c in cat_q.scalars():
            cat_map[c.id] = c.name

    metric_ids = list({e.metric_id for e in ent_map.values() if e.metric_id})
    metric_map: dict = {}
    if metric_ids:
        met_q = await db.execute(select(LicenseMetric).where(LicenseMetric.id.in_(metric_ids)))
        for m in met_q.scalars():
            metric_map[m.id] = m.name

    region_ids = list({e.region_id for e in ent_map.values() if e.region_id})
    region_map: dict = {}
    if region_ids:
        reg_q = await db.execute(select(Region).where(Region.id.in_(region_ids)))
        for r in reg_q.scalars():
            region_map[r.id] = r.name

    out = []
    for r in raw:
        base = ReconResultOut.model_validate(r)
        ent  = ent_map.get(r.ent_id)
        sw   = sw_map.get(ent.sw_id) if ent else None
        out.append(base.model_copy(update={
            "sw_id":         ent.sw_id if ent else None,
            "canonical_name": sw.canonical_name if sw else None,
            "publisher":     sw.publisher if sw else None,
            "category_name": cat_map.get(sw.category_id) if sw and sw.category_id else None,
            "metric_name":   metric_map.get(ent.metric_id) if ent and ent.metric_id else None,
            "region_name":   region_map.get(ent.region_id) if ent and ent.region_id else None,
        }))
    return out


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
    results = await _enrich(results_q.scalars().all(), db)
    return ReconRunWithResults(run=ReconRunOut.model_validate(run), results=results)


@router.get("/results", response_model=list[ReconRunOut])
async def list_runs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ReconciliationRun).order_by(ReconciliationRun.run_date.desc()).limit(20)
    )
    return [ReconRunOut.model_validate(r) for r in result.scalars().all()]


@router.get("/results/latest", response_model=ReconRunWithResults)
async def latest_run(db: AsyncSession = Depends(get_db)):
    run_result = await db.execute(
        select(ReconciliationRun).order_by(ReconciliationRun.run_date.desc()).limit(1)
    )
    run = run_result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="No reconciliation runs found")
    results_q = await db.execute(
        select(ReconciliationResult).where(ReconciliationResult.run_id == run.id)
    )
    results = await _enrich(results_q.scalars().all(), db)
    return ReconRunWithResults(run=ReconRunOut.model_validate(run), results=results)


@router.get("/results/{run_id}", response_model=ReconRunWithResults)
async def get_run(run_id: UUID, db: AsyncSession = Depends(get_db)):
    run = await db.get(ReconciliationRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    results_q = await db.execute(
        select(ReconciliationResult).where(ReconciliationResult.run_id == run_id)
    )
    results = await _enrich(results_q.scalars().all(), db)
    return ReconRunWithResults(run=ReconRunOut.model_validate(run), results=results)
