from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.catalog import SoftwareCatalog
from app.models.contracts import Entitlement, Contract
from app.models.alerts import Alert, AlertRead
from app.models.discovery import DiscoveryRecord
from app.schemas.dashboard import DashboardSummaryOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummaryOut)
async def get_summary(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # SW count
    total_sw = (await db.execute(select(func.count()).select_from(SoftwareCatalog))).scalar_one()

    # Entitlement counts
    ents_result = await db.execute(select(Entitlement))
    ents = ents_result.scalars().all()
    total_entitlements = len(ents)
    total_annual_cost = sum(e.annual_cost_inr or 0 for e in ents)
    over_deployed = sum(1 for e in ents if e.status == "OVER_DEPLOYED")
    watch = sum(1 for e in ents if e.status == "WATCH")
    under_utilised = sum(1 for e in ents if e.status == "UNDER_UTILISED")

    # Expiring in 30 days — check contracts
    in_30d = date.today() + timedelta(days=30)
    expiring_ids = set()
    for ent in ents:
        if ent.contract_id:
            contract = await db.get(Contract, ent.contract_id)
            if contract and contract.end_date and date.today() <= contract.end_date <= in_30d:
                expiring_ids.add(ent.ent_id)

    # Unread alert count for current user
    read_result = await db.execute(
        select(AlertRead.alert_id).where(AlertRead.user_id == current_user.id)
    )
    read_ids = {row[0] for row in read_result.fetchall()}
    total_alerts = (await db.execute(select(func.count()).select_from(Alert))).scalar_one()
    unread_alerts = total_alerts - len(read_ids)

    # Discovery
    total_discovery = (await db.execute(select(func.count()).select_from(DiscoveryRecord))).scalar_one()
    matched_discovery = (await db.execute(
        select(func.count()).select_from(DiscoveryRecord).where(DiscoveryRecord.sw_id.is_not(None))
    )).scalar_one()

    return DashboardSummaryOut(
        total_sw=total_sw,
        total_entitlements=total_entitlements,
        total_annual_cost_inr=total_annual_cost,
        over_deployed_count=over_deployed,
        watch_count=watch,
        under_utilised_count=under_utilised,
        expiring_30d_count=len(expiring_ids),
        unread_alerts_count=max(0, unread_alerts),
        total_discovery_records=total_discovery,
        matched_discovery_count=matched_discovery,
    )
