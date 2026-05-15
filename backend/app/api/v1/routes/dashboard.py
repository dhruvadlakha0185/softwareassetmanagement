from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.catalog import SoftwareCatalog
from app.models.contracts import Entitlement, Contract
from app.models.masters import Category
from app.models.alerts import Alert, AlertRead
from app.models.discovery import DiscoveryRecord
from app.schemas.dashboard import (
    DashboardSummaryOut, UtilisationItem, ContractExpiring,
    SpendByCategory, GxPSummary,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummaryOut)
async def get_summary(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()

    # ── SW catalog ────────────────────────────────────────────────────────────
    total_sw = (await db.execute(select(func.count()).select_from(SoftwareCatalog))).scalar_one()

    sw_result = await db.execute(select(SoftwareCatalog))
    all_sw = sw_result.scalars().all()

    gxp_titles   = [sw for sw in all_sw if sw.gxp_flag != "no"]
    cfr_21_count  = sum(1 for sw in all_sw if sw.gxp_flag == "yes_21cfr")
    annex11_count = sum(1 for sw in all_sw if sw.gxp_flag == "yes_annex11")
    both_count    = sum(1 for sw in all_sw if sw.gxp_flag == "yes_both")

    # ── Entitlements ──────────────────────────────────────────────────────────
    ents_result = await db.execute(select(Entitlement))
    ents = ents_result.scalars().all()

    total_entitlements = len(ents)
    total_annual_cost  = sum(e.annual_cost_inr or 0 for e in ents)
    over_deployed      = sum(1 for e in ents if e.status == "OVER_DEPLOYED")
    watch              = sum(1 for e in ents if e.status == "WATCH")
    under_utilised     = sum(1 for e in ents if e.status == "UNDER_UTILISED")

    # ── Contracts expiry ──────────────────────────────────────────────────────
    expiring_90d_ids, expiring_30d_ids = set(), set()
    contract_cache: dict = {}
    sw_name_cache: dict = {}

    for ent in ents:
        if not ent.contract_id:
            continue
        if ent.contract_id not in contract_cache:
            contract_cache[ent.contract_id] = await db.get(Contract, ent.contract_id)
        c = contract_cache[ent.contract_id]
        if c and c.end_date:
            days = (c.end_date - today).days
            if 0 <= days <= 90:
                expiring_90d_ids.add(ent.ent_id)
            if 0 <= days <= 30:
                expiring_30d_ids.add(ent.ent_id)

    # Build expiring_contracts list (next 5 unique contracts by end_date)
    seen_contracts: set = set()
    expiring_contracts: list[ContractExpiring] = []
    sorted_ents = sorted(
        [e for e in ents if e.contract_id and e.contract_id in contract_cache],
        key=lambda e: contract_cache[e.contract_id].end_date or date.max,
    )
    for ent in sorted_ents:
        c = contract_cache.get(ent.contract_id)
        if not c or not c.end_date or c.id in seen_contracts:
            continue
        days = (c.end_date - today).days
        if days < 0:
            continue  # already expired
        seen_contracts.add(c.id)
        if ent.sw_id not in sw_name_cache:
            sw_name_cache[ent.sw_id] = await db.get(SoftwareCatalog, ent.sw_id)
        sw = sw_name_cache.get(ent.sw_id)
        is_gxp = (sw.gxp_flag != "no") if sw else False
        expiring_contracts.append(ContractExpiring(
            sw_id=ent.sw_id,
            canonical_name=sw.canonical_name if sw else ent.sw_id,
            contract_name=ent.contract_name,
            end_date=c.end_date,
            days_to_expiry=days,
            total_value_inr=c.total_value_inr,
            is_gxp=is_gxp,
            auto_renewal_clause=c.auto_renewal_clause,
        ))
        if len(expiring_contracts) >= 5:
            break

    # ── Top utilisation (top 6 by util_pct desc, only where counts exist) ────
    util_items: list[UtilisationItem] = []
    for ent in ents:
        if not ent.entitled_count or ent.entitled_count == 0:
            continue
        in_use = ent.in_use_count or 0
        pct = round(in_use / ent.entitled_count * 100, 1)
        if ent.sw_id not in sw_name_cache:
            sw_name_cache[ent.sw_id] = await db.get(SoftwareCatalog, ent.sw_id)
        sw = sw_name_cache.get(ent.sw_id)
        util_items.append(UtilisationItem(
            ent_id=ent.ent_id,
            sw_id=ent.sw_id,
            canonical_name=sw.canonical_name if sw else ent.sw_id,
            contract_name=ent.contract_name,
            entitled_count=ent.entitled_count,
            in_use_count=in_use,
            util_pct=pct,
            status=ent.status,
        ))
    util_items.sort(key=lambda x: x.util_pct, reverse=True)
    top_utilisation = util_items[:6]

    # ── Spend by category ─────────────────────────────────────────────────────
    category_spend: dict[str, int] = {}
    for ent in ents:
        if not ent.annual_cost_inr:
            continue
        if ent.sw_id not in sw_name_cache:
            sw_name_cache[ent.sw_id] = await db.get(SoftwareCatalog, ent.sw_id)
        sw = sw_name_cache.get(ent.sw_id)
        if not sw or not sw.category_id:
            cat_name = "Uncategorised"
        else:
            cat = await db.get(Category, sw.category_id)
            cat_name = cat.name if cat else "Uncategorised"
        category_spend[cat_name] = category_spend.get(cat_name, 0) + (ent.annual_cost_inr or 0)

    # Sort named categories first (descending by spend), then Uncategorised last
    named = sorted(
        [SpendByCategory(category_name=k, total_inr=v) for k, v in category_spend.items() if k != "Uncategorised"],
        key=lambda x: x.total_inr, reverse=True,
    )[:6]
    spend_by_category = named  # Uncategorised excluded — SW without category don't distort chart

    # ── Alerts (unread) ───────────────────────────────────────────────────────
    read_result = await db.execute(
        select(AlertRead.alert_id).where(AlertRead.user_id == current_user.id)
    )
    read_ids = {row[0] for row in read_result.fetchall()}
    total_alerts = (await db.execute(select(func.count()).select_from(Alert))).scalar_one()
    unread_alerts = max(0, total_alerts - len(read_ids))

    # ── Discovery ─────────────────────────────────────────────────────────────
    total_discovery = (await db.execute(select(func.count()).select_from(DiscoveryRecord))).scalar_one()
    matched_discovery = (await db.execute(
        select(func.count()).select_from(DiscoveryRecord).where(DiscoveryRecord.sw_id.is_not(None))
    )).scalar_one()

    # ── Potential savings = Σ unit_cost × (entitled - in_use) for UNDER_UTILISED
    potential_savings = sum(
        (e.unit_cost_inr or 0) * max(0, (e.entitled_count or 0) - (e.in_use_count or 0))
        for e in ents if e.status == "UNDER_UTILISED"
    )

    return DashboardSummaryOut(
        total_sw=total_sw,
        total_entitlements=total_entitlements,
        total_annual_cost_inr=total_annual_cost,
        potential_savings_inr=potential_savings,
        over_deployed_count=over_deployed,
        watch_count=watch,
        under_utilised_count=under_utilised,
        expiring_90d_count=len(expiring_90d_ids),
        expiring_30d_count=len(expiring_30d_ids),
        unread_alerts_count=unread_alerts,
        total_discovery_records=total_discovery,
        matched_discovery_count=matched_discovery,
        top_utilisation=top_utilisation,
        expiring_contracts=expiring_contracts,
        spend_by_category=spend_by_category,
        gxp_summary=GxPSummary(
            total_gxp_titles=len(gxp_titles),
            cfr_21_count=cfr_21_count,
            annex11_count=annex11_count,
            both_count=both_count,
            non_gxp_count=total_sw - len(gxp_titles),
        ),
    )
