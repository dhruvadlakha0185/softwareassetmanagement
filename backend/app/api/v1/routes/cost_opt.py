from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.contracts import Entitlement
from app.models.catalog import SoftwareCatalog
from app.schemas.cost_opt import CostOptItem, CostOptScorecardOut

router = APIRouter(prefix="/cost-optimisation", tags=["cost-optimisation"])


@router.get("/scorecard", response_model=CostOptScorecardOut)
async def get_scorecard(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ents_result = await db.execute(select(Entitlement))
    ents = ents_result.scalars().all()

    items = []
    for ent in ents:
        status = ent.status
        if status not in ("UNDER_UTILISED", "OVER_DEPLOYED", "WATCH"):
            continue

        sw = await db.get(SoftwareCatalog, ent.sw_id)
        canonical_name = sw.canonical_name if sw else ent.sw_id

        entitled = ent.entitled_count or 0
        in_use = ent.in_use_count or 0
        unit_cost = ent.unit_cost_inr or 0

        if status == "UNDER_UTILISED":
            est_saving = unit_cost * max(0, entitled - in_use)
            action = "RIGHT-SIZE"
        elif status == "OVER_DEPLOYED":
            est_saving = 0
            action = "IMMEDIATE-RISK"
        else:  # WATCH
            est_saving = 0
            action = "WATCH"

        items.append(CostOptItem(
            ent_id=ent.ent_id,
            sw_id=ent.sw_id,
            canonical_name=canonical_name,
            contract_name=ent.contract_name,
            status=status,
            entitled_count=ent.entitled_count,
            in_use_count=ent.in_use_count,
            unit_cost_inr=ent.unit_cost_inr,
            annual_cost_inr=ent.annual_cost_inr,
            est_annual_saving_inr=est_saving,
            action=action,
        ))

    # Sort: OVER_DEPLOYED first (risk), then by est_saving descending
    items.sort(key=lambda x: (0 if x.status == "OVER_DEPLOYED" else 1, -x.est_annual_saving_inr))
    total_saving = sum(i.est_annual_saving_inr for i in items)

    return CostOptScorecardOut(total_est_saving_inr=total_saving, items=items)
