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
    results = [ReconResultOut.model_validate(r) for r in results_q.scalars().all()]
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
    results = [ReconResultOut.model_validate(r) for r in results_q.scalars().all()]
    return ReconRunWithResults(run=ReconRunOut.model_validate(run), results=results)


@router.get("/results/{run_id}", response_model=ReconRunWithResults)
async def get_run(run_id: UUID, db: AsyncSession = Depends(get_db)):
    run = await db.get(ReconciliationRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    results_q = await db.execute(
        select(ReconciliationResult).where(ReconciliationResult.run_id == run_id)
    )
    results = [ReconResultOut.model_validate(r) for r in results_q.scalars().all()]
    return ReconRunWithResults(run=ReconRunOut.model_validate(run), results=results)
