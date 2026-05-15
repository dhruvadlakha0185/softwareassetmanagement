from __future__ import annotations
from datetime import date
from pydantic import BaseModel


class UtilisationItem(BaseModel):
    ent_id: str
    sw_id: str
    canonical_name: str
    contract_name: str | None = None
    entitled_count: int
    in_use_count: int
    util_pct: float
    status: str


class ContractExpiring(BaseModel):
    sw_id: str
    canonical_name: str
    contract_name: str | None = None
    end_date: date
    days_to_expiry: int
    total_value_inr: int | None = None
    is_gxp: bool
    auto_renewal_clause: str | None = None


class SpendByCategory(BaseModel):
    category_name: str
    total_inr: int


class GxPSummary(BaseModel):
    total_gxp_titles: int
    cfr_21_count: int
    annex11_count: int
    both_count: int
    non_gxp_count: int


class DashboardSummaryOut(BaseModel):
    # ── Metric cards ──────────────────────────────────────────────────────────
    total_sw: int
    total_entitlements: int
    total_annual_cost_inr: int
    over_deployed_count: int
    watch_count: int
    under_utilised_count: int
    expiring_90d_count: int       # ≤90 days (for metric card subtitle)
    expiring_30d_count: int       # ≤30 days (for alert banner)
    unread_alerts_count: int
    total_discovery_records: int
    matched_discovery_count: int
    # Potential savings = Σ unit_cost × (entitled - in_use) for UNDER_UTILISED entitlements
    potential_savings_inr: int
    # ── Rich panels ───────────────────────────────────────────────────────────
    top_utilisation: list[UtilisationItem]      # top 6 by util_pct desc
    expiring_contracts: list[ContractExpiring]  # next 5 by end_date
    spend_by_category: list[SpendByCategory]    # top 6 categories by spend (excludes Uncategorised)
    gxp_summary: GxPSummary
