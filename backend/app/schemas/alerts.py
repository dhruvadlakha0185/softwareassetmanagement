from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class AlertOut(BaseModel):
    id: UUID
    alert_type: str
    ent_id: str | None = None
    severity: str
    days_to_expiry: int | None = None
    title: str
    body_json: dict | None = None
    is_gxp: bool
    created_at: datetime
    is_read: bool = False       # computed from alert_reads for current user
    model_config = {"from_attributes": True}


class AlertCountsOut(BaseModel):
    total_unread: int
    critical: int
    high: int
    medium: int
    info: int
