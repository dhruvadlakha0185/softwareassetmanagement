"""
Alert generator: checks all entitlements for renewal and utilisation alerts.
Idempotent — will not create duplicate alerts for the same entitlement + type on the same day.
Called by APScheduler daily at midnight UTC, and also manually via POST /reconciliation/run.
"""
from datetime import date, datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models.contracts import Entitlement, Contract, EntitlementPriceSchedule, EntitlementDoaContact
from app.models.users import DOAHierarchy
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


async def get_doa_contacts_for_entitlement(db: AsyncSession, ent_id: str):
    """
    Returns per-entitlement DOA contacts if any are set; falls back to the
    global doa_hierarchy list so existing entitlements keep alerting.
    """
    result = await db.execute(
        select(DOAHierarchy)
        .join(EntitlementDoaContact, DOAHierarchy.id == EntitlementDoaContact.doa_contact_id)
        .where(EntitlementDoaContact.ent_id == ent_id)
    )
    contacts = result.scalars().all()
    if contacts:
        return contacts
    result = await db.execute(select(DOAHierarchy))
    return result.scalars().all()


async def sync_active_pricing(db: AsyncSession) -> int:
    """
    For every entitlement with an active price schedule row, update unit_cost /
    annual_cost / entitled_count to match. Returns count of entitlements updated.
    """
    today = date.today()
    result = await db.execute(
        select(EntitlementPriceSchedule).where(
            and_(
                EntitlementPriceSchedule.effective_from <= today,
                EntitlementPriceSchedule.effective_to >= today,
            )
        )
    )
    schedules = result.scalars().all()
    synced = 0
    for sched in schedules:
        try:
            ent = await db.get(Entitlement, sched.ent_id)
            if not ent:
                continue
            if (
                ent.unit_cost != sched.unit_cost
                or ent.annual_cost != sched.annual_cost
                or ent.entitled_count != sched.entitled_count
            ):
                ent.unit_cost = sched.unit_cost
                ent.annual_cost = sched.annual_cost
                ent.entitled_count = sched.entitled_count
                synced += 1
        except Exception as exc:
            print(f"sync_active_pricing: skipping {sched.ent_id} — {exc}")
            continue
    print(f"sync_active_pricing: synced {synced} entitlement(s)")
    return synced


async def generate_price_change_alerts(db: AsyncSession) -> int:
    """
    For each Year-2+ schedule row whose effective_from is within the contract's
    renewal_alert_extra_days window, emit a PRICE_YEAR_CHANGE alert.
    """
    today = date.today()
    result = await db.execute(
        select(EntitlementPriceSchedule).where(
            EntitlementPriceSchedule.year_number > 1
        )
    )
    future_schedules = result.scalars().all()
    created = 0

    ent_ids = {s.ent_id for s in future_schedules}
    if not ent_ids:
        return 0
    ent_result = await db.execute(select(Entitlement).where(Entitlement.ent_id.in_(ent_ids)))
    ent_map = {e.ent_id: e for e in ent_result.scalars().all()}

    for sched in future_schedules:
        try:
            days_until = (sched.effective_from - today).days
            if days_until < 0:
                continue

            ent = ent_map.get(sched.ent_id)
            if not ent:
                continue

            contract = await db.get(Contract, ent.contract_id) if ent.contract_id else None
            stored = contract.renewal_alert_extra_days if contract else None
            thresholds = sorted(set(stored), reverse=True) if stored else RENEWAL_THRESHOLDS

            if days_until not in thresholds:
                continue

            if await _alert_exists_today(db, ent.ent_id, "PRICE_YEAR_CHANGE", days_until):
                continue

            prev_result = await db.execute(
                select(EntitlementPriceSchedule).where(
                    and_(
                        EntitlementPriceSchedule.ent_id == sched.ent_id,
                        EntitlementPriceSchedule.year_number == sched.year_number - 1,
                    )
                )
            )
            prev = prev_result.scalar_one_or_none()

            sw = await db.get(SoftwareCatalog, ent.sw_id)
            sw_name = sw.primary_sw_name if sw else ent.sw_id

            db.add(Alert(
                alert_type="PRICE_YEAR_CHANGE",
                ent_id=ent.ent_id,
                severity=_renewal_severity(days_until),
                days_to_expiry=days_until,
                title=f"Pricing change in {days_until} day{'s' if days_until != 1 else ''}: {sw_name} (Year {sched.year_number})",
                body_json={
                    "ent_id": ent.ent_id,
                    "sw_name": sw_name,
                    "year_number": sched.year_number,
                    "effective_from": str(sched.effective_from),
                    "prev_seats": prev.entitled_count if prev else None,
                    "new_seats": sched.entitled_count,
                    "prev_unit_cost": prev.unit_cost if prev else None,
                    "new_unit_cost": sched.unit_cost,
                    "prev_annual_cost": prev.annual_cost if prev else None,
                    "new_annual_cost": sched.annual_cost,
                    "contract_id": str(contract.id) if contract else None,
                },
                is_gxp=(sw.gxp_flag != "no") if sw else False,
            ))
            created += 1
        except Exception as exc:
            print(f"generate_price_change_alerts: skipping schedule {sched.id} — {exc}")
            continue

    return created


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
    await sync_active_pricing(db)
    price_change_created = await generate_price_change_alerts(db)

    created = price_change_created
    ents_result = await db.execute(select(Entitlement))
    ents = ents_result.scalars().all()

    for ent in ents:
        sw = await db.get(SoftwareCatalog, ent.sw_id)
        is_gxp = (sw.gxp_flag != "no") if sw else False
        sw_name = sw.primary_sw_name if sw else ent.sw_id

        # ── Renewal alerts ─────────────────────────────────────────────────────
        if ent.contract_id:
            contract = await db.get(Contract, ent.contract_id)
            if contract and contract.end_date:
                days = (contract.end_date - date.today()).days
                stored = contract.renewal_alert_extra_days
                thresholds = sorted(set(stored), reverse=True) if stored else RENEWAL_THRESHOLDS
                for threshold in thresholds:
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
