from __future__ import annotations
from datetime import date
from pydantic import BaseModel


class CostOptItem(BaseModel):
    ent_id: str
    sw_id: str
    canonical_name: str
    publisher: str | None = None
    contract_name: str | None = None
    license_type: str
    metric_name: str | None = None
    status: str
    entitled_count: int | None = None
    in_use_count: int | None = None
    idle_count: int                   # entitled - in_use
    util_pct: float | None = None
    unit_cost_inr: int | None = None
    annual_cost_inr: int | None = None
    est_annual_saving_inr: int
    renewal_date: date | None = None  # from contract.end_date
    action: str                       # "RIGHT-SIZE" | "IMMEDIATE-RISK" | "WATCH"
    opportunity_tag: str | None = None  # e.g. "GxP Expiring", "Audit Risk", "Monitor"
    is_gxp: bool = False


class CostOptScorecardOut(BaseModel):
    total_est_saving_inr: int      # UNDER_UTILISED savings only (right-size opportunities)
    total_risk_exposure_inr: int   # OVER_DEPLOYED exposure only (unlicensed overage cost)
    under_utilised_count: int
    renewal_actions_count: int     # items expiring within 90 days
    items: list[CostOptItem]
