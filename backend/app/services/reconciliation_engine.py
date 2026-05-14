"""
Reconciliation engine: computes util_pct and status for every entitlement,
calls the AI advisor, writes ReconciliationRun + ReconciliationResult rows,
and updates Entitlement.status in-place.
"""
from datetime import date
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.contracts import Entitlement, Contract
from app.models.reconciliation import ReconciliationRun, ReconciliationResult
from app.models.catalog import SoftwareCatalog
from app.services.ai.recon_advisor import get_recommendations


def _compute_recon_status(entitled: int | None, in_use: int | None) -> str:
    """Compute recon status from counts. Does NOT handle EXPIRED (that's on Entitlement)."""
    if not entitled or entitled == 0:
        return "OK"
    util = (in_use or 0) / entitled
    if util > 1.0:
        return "OVER_DEPLOYED"
    if util > 0.9:
        return "WATCH"
    if util < 0.3:
        return "UNDER_UTILISED"
    return "OK"


def _compute_util_pct(entitled: int | None, in_use: int | None) -> float | None:
    if not entitled or entitled == 0:
        return None
    return round((in_use or 0) / entitled * 100, 1)


async def run_reconciliation(
    db: AsyncSession,
    triggered_by_id: UUID | None = None,
) -> ReconciliationRun:
    """
    Full reconciliation pass. Returns the ReconciliationRun record.
    Safe to call with no entitlements (returns run with 0 processed).
    """
    run = ReconciliationRun(triggered_by=triggered_by_id)
    db.add(run)
    await db.flush()  # get run.id

    ents_result = await db.execute(select(Entitlement))
    ents = ents_result.scalars().all()

    # Build contexts for AI advisor
    contexts = []
    for ent in ents:
        sw = await db.get(SoftwareCatalog, ent.sw_id)
        contexts.append({
            "ent_id": ent.ent_id,
            "sw_name": sw.canonical_name if sw else ent.sw_id,
            "util_pct": _compute_util_pct(ent.entitled_count, ent.in_use_count),
            "status": _compute_recon_status(ent.entitled_count, ent.in_use_count),
            "license_type": ent.license_type,
            "unit_cost_inr": ent.unit_cost_inr,
            "entitled": ent.entitled_count,
            "in_use": ent.in_use_count,
            "is_gxp": sw.gxp_flag != "no" if sw else False,
        })

    # Get AI recommendations (best-effort — won't block if OpenAI is down)
    recommendations = await get_recommendations(contexts)

    # Write results + update Entitlement.status
    for ctx in contexts:
        ent_id = ctx["ent_id"]
        recon_status = ctx["status"]
        util_pct = ctx["util_pct"]

        ent = next(e for e in ents if e.ent_id == ent_id)

        # Check if contract is expired
        if ent.contract_id:
            contract = await db.get(Contract, ent.contract_id)
            if contract and contract.end_date and contract.end_date < date.today():
                ent.status = "EXPIRED"
            else:
                ent.status = recon_status
        else:
            ent.status = recon_status

        result = ReconciliationResult(
            run_id=run.id,
            ent_id=ent_id,
            entitled=ctx["entitled"],
            in_use=ctx["in_use"],
            util_pct=util_pct,
            status=recon_status,
            ai_recommendation=recommendations.get(ent_id),
        )
        db.add(result)

    run.entitlements_processed = len(ents)
    await db.commit()
    await db.refresh(run)
    return run
