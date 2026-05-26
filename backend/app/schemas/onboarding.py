from __future__ import annotations
from datetime import date
from uuid import UUID
from pydantic import BaseModel


class LineItemIn(BaseModel):
    contract_name: str
    metric: str | None = None
    license_type_id: UUID | None = None
    entitled_count: int | None = None
    unit_cost: int | None = None
    annual_cost: int | None = None
    notes: str | None = None
    region_id: UUID | None = None
    discovery_source_id: UUID | None = None
    usage_method_id: UUID | None = None
    app_owner_id: UUID | None = None
    # Canonical mapping — filled in Step 4 of wizard
    primary_sw_name: str | None = None
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
    primary_sw_name: str                  # required — new or existing
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
    secondary_owner_id: UUID | None = None
    notes: str | None = None
    # Step 3 — line items
    line_items: list[LineItemIn] = []
    # Step 6 — aliases to add
    aliases: list[str] = []


class PublishOut(BaseModel):
    sw_id: str
    contract_id: UUID
    ent_ids: list[str]


# ── Multi-line-item publish (new wizard) ──────────────────────────────────────


class PriceScheduleIn(BaseModel):
    year_number: int
    effective_from: date
    effective_to: date
    entitled_count: int
    unit_cost: int
    annual_cost: int


class MultiLineItemIn(BaseModel):
    """One line item = one Contract Name → one Canonical Name → one SW_ID + ENT_ID."""
    contract_name: str                    # as written in the contract
    primary_sw_name: str                   # standardised platform name
    sw_id: str | None = None             # existing SW_ID; None = create new
    license_type_id: UUID | None = None
    metric_id: UUID | None = None
    entitled_count: int | None = None
    unit_cost: int | None = None
    annual_cost: int | None = None
    # Per-item metadata (merged from old Step 4)
    deployment: str = "cloud"
    regions: list[str] | None = None          # multi-select DRL regions
    business_units: list[str] | None = None   # per-item business units
    gxp_flag: str = "no"
    notes: str | None = None             # description / use of this specific software; AI-enriched if blank on publish
    aliases: list[str] = []
    # Required only when sw_id is None (creating new catalog entry)
    category_id: UUID | None = None
    sub_category_id: UUID | None = None
    vendor_risk: str = "LOW"
    publisher: str | None = None
    price_schedule: list[PriceScheduleIn] = []


class MultiPublishPayload(BaseModel):
    # Contract header fields (shared across all line items)
    vendor_name: str | None = None
    reseller: str | None = None
    po_number: str | None = None
    clm_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    total_value_inr: int | None = None
    auto_renewal_clause: str | None = None
    # Owner & source config (shared — applies to all line items)
    app_owner_id: UUID | None = None
    secondary_owner_id: UUID | None = None
    discovery_source_id: UUID | None = None
    usage_method_id: UUID | None = None
    renewal_alert_extra_days: list[int] | None = None
    currency: str | None = None
    # Line items — each carries its own deployment/region/notes/gxp
    line_items: list[MultiLineItemIn] = []


class MultiPublishCreated(BaseModel):
    sw_id: str
    ent_id: str
    contract_id: UUID
    primary_sw_name: str
    contract_name: str
    is_new_sw: bool


class MultiPublishOut(BaseModel):
    created: list[MultiPublishCreated]
    skipped: list[str] = []
