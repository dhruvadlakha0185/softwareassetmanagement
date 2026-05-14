from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class EntitlementOut(BaseModel):
    ent_id: str
    sw_id: str
    contract_id: UUID | None = None
    contract_name: str | None = None
    metric_id: UUID | None = None
    license_type: str
    entitled_count: int | None = None
    in_use_count: int | None = None
    unit_cost_inr: int | None = None
    annual_cost_inr: int | None = None
    region_id: UUID | None = None
    discovery_source_id: UUID | None = None
    usage_method_id: UUID | None = None
    app_owner_id: UUID | None = None
    status: str
    last_updated: datetime | None = None
    model_config = {"from_attributes": True}


class EntitlementUpdate(BaseModel):
    contract_name: str | None = None
    metric_id: UUID | None = None
    license_type: str | None = None
    entitled_count: int | None = None
    in_use_count: int | None = None
    unit_cost_inr: int | None = None
    annual_cost_inr: int | None = None
    region_id: UUID | None = None
    app_owner_id: UUID | None = None
    status: str | None = None


class UploadResultOut(BaseModel):
    upload_id: UUID
    tab_a_updated: int
    tab_b_updated: int
    errors: list[str] = []
