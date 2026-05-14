from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class AuditTrailOut(BaseModel):
    id: UUID
    user_id: UUID | None = None
    action_type: str
    entity_type: str
    entity_id: str | None = None
    sw_id: str | None = None
    before_values_json: dict | None = None
    after_values_json: dict | None = None
    reason_for_change: str | None = None
    file_hash: str | None = None
    is_gxp: bool
    created_at_utc: datetime
    is_archived: bool
    model_config = {"from_attributes": True}
