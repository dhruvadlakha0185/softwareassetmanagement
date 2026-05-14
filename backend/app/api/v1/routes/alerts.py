from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.alerts import Alert, AlertRead
from app.schemas.alerts import AlertOut, AlertCountsOut

router = APIRouter(prefix="/alerts", tags=["alerts"])


async def _is_read(db: AsyncSession, alert_id: UUID, user_id: UUID) -> bool:
    result = await db.execute(
        select(AlertRead).where(
            AlertRead.alert_id == alert_id,
            AlertRead.user_id == user_id,
        )
    )
    return result.scalar_one_or_none() is not None


@router.get("", response_model=list[AlertOut])
async def list_alerts(
    alert_type: str | None = Query(None),
    severity: str | None = Query(None),
    unread_only: bool = Query(False),
    limit: int = Query(100, le=500),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Alert).order_by(Alert.created_at.desc()).limit(limit)
    if alert_type:
        q = q.where(Alert.alert_type == alert_type)
    if severity:
        q = q.where(Alert.severity == severity)
    result = await db.execute(q)
    alerts = result.scalars().all()

    out = []
    for a in alerts:
        is_read = await _is_read(db, a.id, current_user.id)
        if unread_only and is_read:
            continue
        item = AlertOut.model_validate(a)
        item.is_read = is_read
        out.append(item)
    return out


@router.post("/{alert_id}/read", status_code=204)
async def mark_read(
    alert_id: UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    already = await _is_read(db, alert_id, current_user.id)
    if not already:
        db.add(AlertRead(alert_id=alert_id, user_id=current_user.id))
        await db.commit()


@router.get("/counts", response_model=AlertCountsOut)
async def alert_counts(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get all alert IDs already read by this user
    read_result = await db.execute(
        select(AlertRead.alert_id).where(AlertRead.user_id == current_user.id)
    )
    read_ids = {row[0] for row in read_result.fetchall()}

    # Get all alerts
    all_alerts_result = await db.execute(select(Alert))
    all_alerts = all_alerts_result.scalars().all()

    unread = [a for a in all_alerts if a.id not in read_ids]
    return AlertCountsOut(
        total_unread=len(unread),
        critical=sum(1 for a in unread if a.severity == "CRITICAL"),
        high=sum(1 for a in unread if a.severity == "HIGH"),
        medium=sum(1 for a in unread if a.severity == "MEDIUM"),
        info=sum(1 for a in unread if a.severity == "INFO"),
    )
