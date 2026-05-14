from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class ReconRunOut(BaseModel):
    id: UUID
    run_date: datetime
    triggered_by: UUID | None = None
    entitlements_processed: int
    model_config = {"from_attributes": True}


class ReconResultOut(BaseModel):
    id: UUID
    run_id: UUID
    ent_id: str
    entitled: float | None = None
    in_use: float | None = None
    util_pct: float | None = None
    status: str | None = None
    ai_recommendation: str | None = None
    generated_at: datetime
    model_config = {"from_attributes": True}


class ReconRunWithResults(BaseModel):
    run: ReconRunOut
    results: list[ReconResultOut]
