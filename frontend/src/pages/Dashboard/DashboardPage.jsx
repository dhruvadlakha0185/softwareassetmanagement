import { useState, useEffect } from "react";
import { fetchDashboardSummary } from "../../api/dashboard";

function MetricCard({ label, value, sub, subClass, colorClass }) {
  return (
    <div className={`met ${colorClass || ""}`}>
      <div className="ml">{label}</div>
      <div className="mv">{value}</div>
      {sub && <div className={`ms ${subClass || ""}`}>{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardSummary()
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page">
        <div className="ph">
          <div className="bc">SAM Platform <span>›</span> Dashboard</div>
          <h1>Software Asset Management</h1>
          <p>Dr. Reddy's Laboratories · Global Portfolio</p>
        </div>
        <div style={{ color: "var(--tx-q)", fontSize: 13 }}>Loading dashboard…</div>
      </div>
    );
  }

  const s = summary || {};
  const totalCostCr = s.total_annual_cost_inr
    ? (s.total_annual_cost_inr / 10_000_000).toFixed(2)
    : "0.00";
  const matchPct = s.total_discovery_records > 0
    ? Math.round((s.matched_discovery_count / s.total_discovery_records) * 100)
    : 0;

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> Dashboard</div>
        <h1>Software Asset Management</h1>
        <p>Dr. Reddy's Laboratories · Global Portfolio · live data</p>
      </div>

      {/* Row 1 — Portfolio overview */}
      <div className="sdiv">Portfolio Overview</div>
      <div className="mg" style={{ marginBottom: 18 }}>
        <MetricCard
          label="Software Titles"
          value={s.total_sw ?? "—"}
          sub="canonical SW catalog entries"
          colorClass="ml-b"
        />
        <MetricCard
          label="Total Entitlements"
          value={s.total_entitlements ?? "—"}
          sub="active license records"
          colorClass="ml-b"
        />
        <MetricCard
          label="Annual License Cost"
          value={`₹${totalCostCr} Cr`}
          sub="sum of all entitlements"
          colorClass="ml-a"
        />
        <MetricCard
          label="Unread Alerts"
          value={s.unread_alerts_count ?? "—"}
          sub={s.unread_alerts_count > 0 ? "action required" : "all clear"}
          subClass={s.unread_alerts_count > 0 ? "red" : "grn"}
          colorClass={s.unread_alerts_count > 0 ? "ml-r" : "ml-g"}
        />
      </div>

      {/* Row 2 — Risk & utilisation */}
      <div className="sdiv">Risk &amp; Utilisation</div>
      <div className="mg3" style={{ marginBottom: 18 }}>
        <MetricCard
          label="Over-Deployed"
          value={s.over_deployed_count ?? "—"}
          sub="in_use > entitled — audit risk"
          subClass={s.over_deployed_count > 0 ? "red" : "grn"}
          colorClass={s.over_deployed_count > 0 ? "ml-r" : "ml-g"}
        />
        <MetricCard
          label="Watch"
          value={s.watch_count ?? "—"}
          sub=">90% utilisation"
          subClass={s.watch_count > 0 ? "amb" : ""}
          colorClass="ml-a"
        />
        <MetricCard
          label="Under-Utilised"
          value={s.under_utilised_count ?? "—"}
          sub="<30% utilisation — right-size opportunity"
          subClass="grn"
          colorClass="ml-g"
        />
      </div>

      {/* Row 3 — Renewals & discovery */}
      <div className="sdiv">Renewals &amp; Discovery</div>
      <div className="mg" style={{ marginBottom: 18 }}>
        <MetricCard
          label="Expiring in 30 Days"
          value={s.expiring_30d_count ?? "—"}
          sub="contracts due for renewal"
          subClass={s.expiring_30d_count > 0 ? "red" : "grn"}
          colorClass={s.expiring_30d_count > 0 ? "ml-r" : "ml-g"}
        />
        <MetricCard
          label="Discovery Records"
          value={s.total_discovery_records ?? "—"}
          sub="from all sources"
          colorClass="ml-b"
        />
        <MetricCard
          label="Matched Discovery"
          value={s.matched_discovery_count ?? "—"}
          sub={`${matchPct}% matched to catalog`}
          subClass={matchPct >= 80 ? "grn" : matchPct >= 50 ? "amb" : "red"}
          colorClass="ml-g"
        />
        <MetricCard
          label="Unmatched Discovery"
          value={(s.total_discovery_records ?? 0) - (s.matched_discovery_count ?? 0)}
          sub="not matched to SW catalog"
          subClass={((s.total_discovery_records ?? 0) - (s.matched_discovery_count ?? 0)) > 0 ? "amb" : "grn"}
          colorClass="ml-a"
        />
      </div>
    </div>
  );
}
