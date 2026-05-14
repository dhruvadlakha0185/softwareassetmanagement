from __future__ import annotations
from pydantic import BaseModel


class CostOptItem(BaseModel):
    ent_id: str
    sw_id: str
    canonical_name: str
    contract_name: str | None = None
    status: str
    entitled_count: int | None = None
    in_use_count: int | None = None
    unit_cost_inr: int | None = None
    annual_cost_inr: int | None = None
    est_annual_saving_inr: int
    action: str   # "RIGHT-SIZE" | "IMMEDIATE-RISK" | "WATCH"


class CostOptScorecardOut(BaseModel):
    total_est_saving_inr: int
    items: list[CostOptItem]
