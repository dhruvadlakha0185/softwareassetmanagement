"""
GxP-compliant audit logger.
Inserts AuditTrail rows only — never updates or deletes.
GxP entries (is_gxp=True) require reason_for_change — raises ValueError if missing.
Caller is responsible for committing the session.
"""
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditTrail


async def log_event(
    db: AsyncSession,
    user_id: UUID | None,
    action_type: str,
    entity_type: str,
    entity_id: str,
    sw_id: str | None = None,
    before: dict | None = None,
    after: dict | None = None,
    reason: str | None = None,
    file_hash: str | None = None,
    is_gxp: bool = False,
) -> AuditTrail:
    """
    Append an audit entry. Does NOT commit — caller commits.

    action_type examples: CATALOG_CREATED, CATALOG_UPDATED, ENTITLEMENT_UPDATED,
                          SOFTWARE_ONBOARDED, RECONCILIATION_RUN, USAGE_UPLOADED
    entity_type examples: software_catalog, entitlement, reconciliation_run
    """
    if is_gxp and not reason:
        raise ValueError(
            f"reason_for_change is required for GxP entity {entity_type}:{entity_id}"
        )
    entry = AuditTrail(
        user_id=user_id,
        action_type=action_type,
        entity_type=entity_type,
        entity_id=entity_id,
        sw_id=sw_id,
        before_values_json=before,
        after_values_json=after,
        reason_for_change=reason,
        file_hash=file_hash,
        is_gxp=is_gxp,
    )
    db.add(entry)
    return entry
