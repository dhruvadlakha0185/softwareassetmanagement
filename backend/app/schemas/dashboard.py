from pydantic import BaseModel


class DashboardSummaryOut(BaseModel):
    total_sw: int
    total_entitlements: int
    total_annual_cost_inr: int
    over_deployed_count: int
    watch_count: int
    under_utilised_count: int
    expiring_30d_count: int
    unread_alerts_count: int
    total_discovery_records: int
    matched_discovery_count: int
