import { useState, useEffect } from "react";
import { fetchScorecard } from "../../api/costOpt";

const ACTION_BADGE = {
  "RIGHT-SIZE":     <span className="tag tg2">Right-Size</span>,
  "IMMEDIATE-RISK": <span className="tag tgr2">Immediate Risk</span>,
  "WATCH":          <span className="tag ta2">Watch</span>,
};

const STATUS_BADGE = {
  UNDER_UTILISED: <span className="tag tg3">Under-Utilised</span>,
  OVER_DEPLOYED:  <span className="tag tgr2">Over-Deployed</span>,
  WATCH:          <span className="tag ta2">Watch</span>,
};

export default function CostOptPage() {
  const [scorecard, setScorecard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScorecard()
      .then(setScorecard)
      .catch(() => setScorecard({ total_est_saving_inr: 0, items: [] }))
      .finally(() => setLoading(false));
  }, []);

  const items = scorecard?.items || [];
  const totalSaving = scorecard?.total_est_saving_inr || 0;

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> Cost Optimisation</div>
        <h1>Cost Optimisation Scorecard</h1>
        <p>CIO / CFO view · right-sizing opportunities · {items.length} actionable items</p>
      </div>

      {/* Summary cards */}
      {scorecard && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div className="met ml-g" style={{ minWidth: 200 }}>
            <div className="ml">Est. Annual Saving</div>
            <div className="mv">₹{totalSaving.toLocaleString("en-IN")}</div>
            <div className="ms grn">from right-sizing under-utilised licenses</div>
          </div>
          <div className="met ml-r" style={{ minWidth: 160 }}>
            <div className="ml">Immediate Risks</div>
            <div className="mv">{items.filter(i => i.action === "IMMEDIATE-RISK").length}</div>
            <div className="ms red">over-deployed licenses</div>
          </div>
          <div className="met ml-a" style={{ minWidth: 160 }}>
            <div className="ml">Watch Items</div>
            <div className="mv">{items.filter(i => i.action === "WATCH").length}</div>
            <div className="ms amb">approaching threshold</div>
          </div>
        </div>
      )}

      {loading && <div style={{ color: "var(--tx-q)", fontSize: 13 }}>Loading…</div>}

      {items.length > 0 && (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Rank</th><th>ENT_ID</th><th>SW_ID</th><th>Canonical Name</th>
                <th>Status</th><th>Entitled</th><th>In Use</th>
                <th>Unit Cost</th><th>Est. Annual Saving</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.ent_id}>
                  <td style={{ textAlign: "center", fontSize: 12, color: "var(--tx-q)" }}>{idx + 1}</td>
                  <td>
                    <code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>
                      {item.ent_id}
                    </code>
                  </td>
                  <td style={{ fontSize: 11.5 }}>{item.sw_id}</td>
                  <td style={{ fontSize: 12 }}><strong>{item.canonical_name}</strong></td>
                  <td>{STATUS_BADGE[item.status] ?? item.status}</td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>{item.entitled_count?.toLocaleString() ?? "—"}</td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>{item.in_use_count?.toLocaleString() ?? "—"}</td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>
                    {item.unit_cost_inr ? `₹${item.unit_cost_inr.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td style={{
                    textAlign: "right", fontSize: 12,
                    fontWeight: item.est_annual_saving_inr > 0 ? 700 : 400,
                    color: item.est_annual_saving_inr > 0 ? "var(--green-m)" : "var(--tx-q)",
                  }}>
                    {item.est_annual_saving_inr > 0
                      ? `₹${item.est_annual_saving_inr.toLocaleString("en-IN")}`
                      : "—"}
                  </td>
                  <td>{ACTION_BADGE[item.action] ?? item.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && items.length === 0 && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 24, textAlign: "center", color: "var(--tx-q)" }}>
          No optimisation opportunities found. Run reconciliation first to compute utilisation statuses.
        </div>
      )}
    </div>
  );
}
