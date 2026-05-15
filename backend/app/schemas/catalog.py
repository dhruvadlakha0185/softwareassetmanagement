from __future__ import annotations
from datetime import date
from uuid import UUID
from pydantic import BaseModel


class SoftwareAliasOut(BaseModel):
    id: UUID
    sw_id: str
    alias_name: str
    source_name: str | None = None
    model_config = {"from_attributes": True}


class SoftwareAliasCreate(BaseModel):
    alias_name: str
    source_name: str | None = None


class SoftwareCatalogCreate(BaseModel):
    canonical_name: str
    publisher: str | None = None
    category_id: UUID | None = None
    sub_category_id: UUID | None = None
    gxp_flag: str = "no"           # no | yes_21cfr | yes_annex11 | yes_both
    vendor_id: UUID | None = None
    vendor_risk: str = "LOW"       # LOW | MEDIUM | HIGH
    deployment: str = "cloud"      # cloud | on_premise | desktop_cloud | hybrid
    region_id: UUID | None = None
    app_owner_id: UUID | None = None
    notes: str | None = None
    onboarded_date: date | None = None


class SoftwareCatalogUpdate(BaseModel):
    canonical_name: str | None = None
    publisher: str | None = None
    category_id: UUID | None = None
    sub_category_id: UUID | None = None
    gxp_flag: str | None = None
    vendor_id: UUID | None = None
    vendor_risk: str | None = None
    deployment: str | None = None
    region_id: UUID | None = None
    app_owner_id: UUID | None = None
    notes: str | None = None


class SoftwareCatalogOut(BaseModel):
    sw_id: str
    canonical_name: str
    publisher: str | None = None
    category_id: UUID | None = None
    sub_category_id: UUID | None = None
    gxp_flag: str
    vendor_id: UUID | None = None
    vendor_risk: str
    deployment: str
    region_id: UUID | None = None
    app_owner_id: UUID | None = None
    notes: str | None = None
    onboarded_date: date | None = None
    aliases: list[SoftwareAliasOut] = []
    model_config = {"from_attributes": True}


class SoftwareCatalogBrief(BaseModel):
    sw_id: str
    canonical_name: str
    model_config = {"from_attributes": True}


# ── Enriched list (resolved names for table display) ─────────────────────────

class SoftwareCatalogRow(BaseModel):
    """Table row — all foreign keys resolved to display names."""
    sw_id: str
    canonical_name: str
    publisher: str | None = None
    category_name: str | None = None
    sub_category_name: str | None = None
    gxp_flag: str
    vendor_risk: str
    license_type: str | None = None   # from first entitlement
    metric_name: str | None = None    # from first entitlement
    deployment: str
    region_name: str | None = None
    app_owner_name: str | None = None
    app_owner_initials: str | None = None
    onboarded_date: date | None = None
    notes: str | None = None
    aliases: list[SoftwareAliasOut] = []


# ── Detail panel ──────────────────────────────────────────────────────────────

class EntitlementSummary(BaseModel):
    ent_id: str
    contract_name: str | None = None
    license_type: str
    metric_name: str | None = None
    entitled_count: int | None = None
    in_use_count: int | None = None
    util_pct: float | None = None
    unit_cost_inr: int | None = None
    annual_cost_inr: int | None = None
    status: str
    # Contract fields
    po_number: str | None = None
    clm_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    auto_renewal_clause: str | None = None
    is_archived: bool = False
    archived_path: str | None = None


class SoftwareCatalogDetail(BaseModel):
    """Full detail for the right-panel drawer."""
    sw_id: str
    canonical_name: str
    publisher: str | None = None
    category_name: str | None = None
    sub_category_name: str | None = None
    gxp_flag: str
    vendor_risk: str
    deployment: str
    region_name: str | None = None
    app_owner_name: str | None = None
    app_owner_initials: str | None = None
    notes: str | None = None
    onboarded_date: date | None = None
    aliases: list[SoftwareAliasOut] = []
    entitlements: list[EntitlementSummary] = []
