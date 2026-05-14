from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


# ── Category ──────────────────────────────────────────────────────────────────
class SubCategoryOut(BaseModel):
    id: UUID
    category_id: UUID
    name: str
    model_config = {"from_attributes": True}


class SubCategoryCreate(BaseModel):
    category_id: UUID
    name: str


class CategoryCreate(BaseModel):
    name: str
    gxp_applicable: str = "no"   # "no" | "yes" | "mixed"


class CategoryOut(BaseModel):
    id: UUID
    name: str
    gxp_applicable: str
    created_at: datetime | None = None
    sub_categories: list[SubCategoryOut] = []
    model_config = {"from_attributes": True}


# ── Vendor ────────────────────────────────────────────────────────────────────
class VendorCreate(BaseModel):
    name: str
    audit_risk: str = "LOW"        # "LOW" | "MEDIUM" | "HIGH"
    last_audit_date: str | None = None
    notes: str | None = None


class VendorOut(VendorCreate):
    id: UUID
    model_config = {"from_attributes": True}


# ── License Metric ────────────────────────────────────────────────────────────
class MetricCreate(BaseModel):
    name: str
    description: str | None = None
    how_to_count: str | None = None


class MetricOut(MetricCreate):
    id: UUID
    model_config = {"from_attributes": True}


# ── Discovery Source ──────────────────────────────────────────────────────────
class DiscoverySourceCreate(BaseModel):
    name: str
    type: str = "manual"
    coverage: str | None = None
    frequency: str | None = None
    contact: str | None = None
    status: str = "active"         # "active" | "inactive" | "stale"
    notes: str | None = None


class DiscoverySourceOut(DiscoverySourceCreate):
    id: UUID
    model_config = {"from_attributes": True}


# ── Usage Update Method ───────────────────────────────────────────────────────
class UsageMethodCreate(BaseModel):
    name: str
    description: str | None = None
    template_required: str = "none"   # "none" | "tab_a" | "tab_a_and_b"


class UsageMethodOut(UsageMethodCreate):
    id: UUID
    model_config = {"from_attributes": True}


# ── Region ────────────────────────────────────────────────────────────────────
class RegionCreate(BaseModel):
    name: str
    sites_json: str | None = None
    regulatory_zone: str | None = None
    data_residency: str | None = None
    aws_region: str | None = None


class RegionOut(RegionCreate):
    id: UUID
    model_config = {"from_attributes": True}


# ── All-masters response (for dropdown population) ────────────────────────────
class AllMastersOut(BaseModel):
    categories: list[CategoryOut]
    vendors: list[VendorOut]
    metrics: list[MetricOut]
    sources: list[DiscoverySourceOut]
    methods: list[UsageMethodOut]
    regions: list[RegionOut]
