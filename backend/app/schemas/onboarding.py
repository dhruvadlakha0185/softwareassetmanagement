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


# ── Multi-line-item publish (new wizard) ──────────────────────────────────────

class MultiLineItemIn(BaseModel):
    """One line item = one Contract Name → one Canonical Name → one SW_ID + ENT_ID."""
    contract_name: str                    # as written in the contract
    canonical_name: str                   # standardised platform name
    sw_id: str | None = None             # existing SW_ID; None = create new
    license_type: str = "subscription"
    metric_id: UUID | None = None
    entitled_count: int | None = None
    unit_cost_inr: int | None = None
    annual_cost_inr: int | None = None
    region_id: UUID | None = None        # per-item override
    gxp_flag: str = "no"
    aliases: list[str] = []
    # Required only when sw_id is None (creating new catalog entry)
    category_id: UUID | None = None
    sub_category_id: UUID | None = None
    deployment: str = "cloud"
    vendor_risk: str = "LOW"
    publisher: str | None = None


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
    # Shared metadata defaults (overridable per item)
    deployment: str = "cloud"
    region_id: UUID | None = None
    notes: str | None = None
    # Owner & source config
    app_owner_id: UUID | None = None
    discovery_source_id: UUID | None = None
    usage_method_id: UUID | None = None
    # Line items
    line_items: list[MultiLineItemIn] = []


class MultiPublishCreated(BaseModel):
    sw_id: str
    ent_id: str
    contract_id: UUID
    canonical_name: str
    contract_name: str
    is_new_sw: bool


class MultiPublishOut(BaseModel):
    created: list[MultiPublishCreated]
    skipped: list[str] = []
