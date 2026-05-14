"""
Alert generator: checks all entitlements for renewal and utilisation alerts.
Idempotent — will not create duplicate alerts for the same entitlement + type on the same day.
Called by APScheduler daily at midnight UTC, and also manually via POST /reconciliation/run.
"""
from datetime import date, datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.contracts import Entitlement, Contract
from app.models.catalog import SoftwareCatalog
from app.models.alerts import Alert

RENEWAL_THRESHOLDS = [90, 60, 30, 15, 7, 1]


def _renewal_severity(days: int) -> str:
    if days <= 7:
        return "CRITICAL"
    if days <= 30:
        return "HIGH"
    if days <= 60:
        return "MEDIUM"
    return "INFO"


def _util_severity(util_pct: float) -> str:
    return "HIGH" if util_pct > 100 else "MEDIUM"


async def _alert_exists_today(
    db: AsyncSession,
    ent_id: str,
    alert_type: str,
    days_to_expiry: int | None = None,
) -> bool:
    today_start = datetime.combine(date.today(), datetime.min.time())
    q = select(Alert).where(
        Alert.ent_id == ent_id,
        Alert.alert_type == alert_type,
        Alert.created_at >= today_start,
    )
    if days_to_expiry is not None:
        q = q.where(Alert.days_to_expiry == days_to_expiry)
    result = await db.execute(q)
    return result.scalar_one_or_none() is not None


async def generate_alerts(db: AsyncSession) -> int:
    """
    Scan entitlements, create alerts where needed.
    Returns the count of new alerts created.
    """
    created = 0
    ents_result = await db.execute(select(Entitlement))
    ents = ents_result.scalars().all()

    for ent in ents:
        sw = await db.get(SoftwareCatalog, ent.sw_id)
        is_gxp = (sw.gxp_flag != "no") if sw else False
        sw_name = sw.canonical_name if sw else ent.sw_id

        # ── Renewal alerts ─────────────────────────────────────────────────────
        if ent.contract_id:
            contract = await db.get(Contract, ent.contract_id)
            if contract and contract.end_date:
                days = (contract.end_date - date.today()).days
                for threshold in RENEWAL_THRESHOLDS:
                    if days == threshold:
                        if not await _alert_exists_today(db, ent.ent_id, "RENEWAL", threshold):
                            db.add(Alert(
                                alert_type="RENEWAL",
                                ent_id=ent.ent_id,
                                severity=_renewal_severity(days),
                                days_to_expiry=days,
                                title=f"Renewal due in {days} day{'s' if days != 1 else ''}: {sw_name}",
                                body_json={
                                    "ent_id": ent.ent_id,
                                    "sw_name": sw_name,
                                    "end_date": str(contract.end_date),
                                    "days_to_expiry": days,
                                    "is_gxp": is_gxp,
                                },
                                is_gxp=is_gxp,
                            ))
                            created += 1

        # ── Utilisation alerts ─────────────────────────────────────────────────
        if ent.entitled_count and ent.entitled_count > 0 and ent.in_use_count is not None:
            util_pct = (ent.in_use_count / ent.entitled_count) * 100
            if util_pct > 90:
                if not await _alert_exists_today(db, ent.ent_id, "UTILISATION"):
                    label = "Over-deployed" if util_pct > 100 else "Watch threshold"
                    db.add(Alert(
                        alert_type="UTILISATION",
                        ent_id=ent.ent_id,
                        severity=_util_severity(util_pct),
                        days_to_expiry=None,
                        title=f"{label}: {sw_name} at {util_pct:.0f}%",
                        body_json={
                            "ent_id": ent.ent_id,
                            "sw_name": sw_name,
                            "util_pct": round(util_pct, 1),
                            "entitled": ent.entitled_count,
                            "in_use": ent.in_use_count,
                            "is_gxp": is_gxp,
                        },
                        is_gxp=is_gxp,
                    ))
                    created += 1

    await db.commit()
    return created
