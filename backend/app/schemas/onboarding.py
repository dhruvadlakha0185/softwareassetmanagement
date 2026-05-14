from __future__ import annotations
from datetime import date
from uuid import UUID
from pydantic import BaseModel


class LineItemIn(BaseModel):
    contract_name: str
    metric: str | None = None
    license_type: str = "subscription"   # subscription | perpetual
    entitled_count: int | None = None
    unit_cost_inr: int | None = None
    annual_cost_inr: int | None = None
    region_id: UUID | None = None
    discovery_source_id: UUID | None = None
    usage_method_id: UUID | None = None
    app_owner_id: UUID | None = None
    # Canonical mapping — filled in Step 4 of wizard
    canonical_name: str | None = None
    sw_id: str | None = None             # existing SW entry to attach to


class DraftSave(BaseModel):
    po_number: str | None = None
    form_data_json: dict | None = None   # full wizard state blob
    current_step: int = 1


class DraftOut(BaseModel):
    id: UUID
    user_id: UUID
    po_number: str | None = None
    form_data_json: dict | None = None
    current_step: int
    model_config = {"from_attributes": True}


class PublishPayload(BaseModel):
    # Step 2 — contract metadata
    po_number: str | None = None
    clm_id: str | None = None
    vendor_id: UUID | None = None
    reseller: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    total_value_inr: int | None = None
    auto_renewal_clause: str | None = None  # yes | no | opt_in
    file_name: str | None = None
    file_path: str | None = None
    # Step 4 — canonical mapping
    canonical_name: str                  # required — new or existing
    sw_id: str | None = None             # if mapping to existing SW entry
    # New SW fields (used when sw_id is None)
    publisher: str | None = None
    category_id: UUID | None = None
    sub_category_id: UUID | None = None
    gxp_flag: str = "no"
    vendor_risk: str = "LOW"
    deployment: str = "cloud"
    region_id: UUID | None = None
    app_owner_id: UUID | None = None
    notes: str | None = None
    # Step 3 — line items
    line_items: list[LineItemIn] = []
    # Step 6 — aliases to add
    aliases: list[str] = []


class PublishOut(BaseModel):
    sw_id: str
    contract_id: UUID
    ent_ids: list[str]
