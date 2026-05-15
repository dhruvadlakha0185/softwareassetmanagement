from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.contracts import Entitlement, Contract
from app.models.catalog import SoftwareCatalog
from app.models.masters import LicenseMetric
from app.schemas.cost_opt import CostOptItem, CostOptScorecardOut

router = APIRouter(prefix="/cost-optimisation", tags=["cost-optimisation"])


def _opportunity_tag(status: str, is_gxp: bool, days_to_renewal: int | None) -> str | None:
    if status == "OVER_DEPLOYED":
        return "Audit Risk"
    if is_gxp and days_to_renewal is not None and days_to_renewal <= 90:
        return "GxP Expiring"
    if days_to_renewal is not None and days_to_renewal <= 90:
        return "Renewal Due"
    if status == "UNDER_UTILISED":
        return "Right-Size"
    if status == "WATCH":
        return "Monitor"
    return None


@router.get("/scorecard", response_model=CostOptScorecardOut)
async def get_scorecard(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    ents_result = await db.execute(select(Entitlement))
    ents = ents_result.scalars().all()

    items: list[CostOptItem] = []

    for ent in ents:
        status = ent.status
        if status not in ("UNDER_UTILISED", "OVER_DEPLOYED", "WATCH"):
            continue

        # SW catalog
        sw = await db.get(SoftwareCatalog, ent.sw_id)
        canonical_name = sw.canonical_name if sw else ent.sw_id
        publisher = sw.publisher if sw else None
        is_gxp = (sw.gxp_flag != "no") if sw else False

        # Metric
        metric = await db.get(LicenseMetric, ent.metric_id) if ent.metric_id else None
        metric_name = metric.name if metric else None

        # Contract / renewal date
        renewal_date = None
        days_to_renewal = None
        if ent.contract_id:
            contract = await db.get(Contract, ent.contract_id)
            if contract and contract.end_date:
                renewal_date = contract.end_date
                days_to_renewal = (contract.end_date - today).days

        # Savings
        entitled = ent.entitled_count or 0
        in_use = ent.in_use_count or 0
        idle = max(0, entitled - in_use)
        unit_cost = ent.unit_cost_inr or 0
        util_pct = round(in_use / entitled * 100, 1) if entitled > 0 else None

        overage = max(0, in_use - entitled)

        if status == "UNDER_UTILISED":
            est_saving = unit_cost * idle
            action = "RIGHT-SIZE"
        elif status == "OVER_DEPLOYED":
            # Financial exposure: cost of unlicensed seats already in use
            est_saving = unit_cost * overage
            action = "IMMEDIATE-RISK"
        else:
            est_saving = 0
            action = "WATCH"

        items.append(CostOptItem(
            ent_id=ent.ent_id,
            sw_id=ent.sw_id,
            canonical_name=canonical_name,
            publisher=publisher,
            contract_name=ent.contract_name,
            license_type=ent.license_type,
            metric_name=metric_name,
            status=status,
            entitled_count=ent.entitled_count,
            in_use_count=in_use,
            idle_count=idle,
            util_pct=util_pct,
            unit_cost_inr=ent.unit_cost_inr,
            annual_cost_inr=ent.annual_cost_inr,
            est_annual_saving_inr=est_saving,
            renewal_date=renewal_date,
            action=action,
            opportunity_tag=_opportunity_tag(status, is_gxp, days_to_renewal),
            is_gxp=is_gxp,
        ))

    # Sort: OVER_DEPLOYED first, then by est_saving desc
    items.sort(key=lambda x: (0 if x.status == "OVER_DEPLOYED" else 1, -x.est_annual_saving_inr))

    total_saving = sum(i.est_annual_saving_inr for i in items if i.status == "UNDER_UTILISED")
    total_risk_exposure = sum(i.est_annual_saving_inr for i in items if i.status == "OVER_DEPLOYED")
    under_utilised_count = sum(1 for i in items if i.status == "UNDER_UTILISED")
    renewal_actions = sum(
        1 for i in items
        if i.renewal_date and 0 <= (i.renewal_date - today).days <= 90
    )

    return CostOptScorecardOut(
        total_est_saving_inr=total_saving,
        total_risk_exposure_inr=total_risk_exposure,
        under_utilised_count=under_utilised_count,
        renewal_actions_count=renewal_actions,
        items=items,
    )
