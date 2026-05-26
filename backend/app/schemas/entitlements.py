from __future__ import annotations
from datetime import datetime, date
from uuid import UUID
from typing import Literal
from pydantic import BaseModel


class EntitlementOut(BaseModel):
    # Core IDs
    ent_id: str
    sw_id: str
    contract_id: UUID | None = None
    # Resolved display fields
    primary_sw_name: str | None = None      # from software_catalog
    publisher: str | None = None           # from software_catalog
    contract_name: str | None = None
    metric_id: UUID | None = None
    metric_name: str | None = None         # resolved
    license_type_id: UUID | None = None
    license_type: str | None = None        # resolved display name
    # Counts & cost
    entitled_count: int | None = None
    in_use_count: int | None = None
    unit_cost: int | None = None
    annual_cost: int | None = None
    notes: str | None = None
    # Contract details (resolved from linked Contract)
    po_number: str | None = None
    clm_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    vendor_reseller: str | None = None     # vendor name or contract.reseller
    # Discovery & usage method
    discovery_source_id: UUID | None = None
    discovery_source_name: str | None = None
    usage_method_id: UUID | None = None
    usage_method_name: str | None = None
    # App owner
    app_owner_id: UUID | None = None
    app_owner_name: str | None = None
    app_owner_initials: str | None = None
    # Status & audit
    region_id: UUID | None = None
    status: str
    renewal_of: str | None = None     # ent_id this record supersedes
    last_updated: datetime | None = None
    model_config = {"from_attributes": True}


class EntitlementUpdate(BaseModel):
    contract_name: str | None = None
    metric_id: UUID | None = None
    license_type_id: UUID | None = None
    entitled_count: int | None = None
    in_use_count: int | None = None
    unit_cost: int | None = None
    annual_cost: int | None = None
    notes: str | None = None
    region_id: UUID | None = None
    app_owner_id: UUID | None = None
    status: str | None = None


class RenewEntitlementRequest(BaseModel):
    contract_name: str
    po_number: str | None = None
    clm_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    total_value_inr: int | None = None
    auto_renewal_clause: Literal["yes", "no", "opt_in"] | None = None
    entitled_count: int | None = None
    unit_cost: int | None = None
    annual_cost: int | None = None
    notes: str | None = None


class RenewEntitlementOut(BaseModel):
    new_ent_id: str
    new_sw_id: str
    retired_ent_id: str


class UploadResultOut(BaseModel):
    upload_id: UUID
    tab_a_updated: int
    tab_b_updated: int
    errors: list[str] = []


class PriceScheduleOut(BaseModel):
    id: UUID
    ent_id: str
    year_number: int
    effective_from: date
    effective_to: date
    entitled_count: int
    unit_cost: int
    annual_cost: int
    model_config = {"from_attributes": True}
