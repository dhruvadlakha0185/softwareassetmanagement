import { useState, useEffect } from "react";
import { fetchScorecard } from "../../api/costOpt";

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtINR(n) {
  if (!n && n !== 0) return "—";
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(0)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

const TYPE_BADGE = {
  subscription: <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: "var(--blue-l)", color: "var(--blue-m)" }}>Sub</span>,
  perpetual:    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: "var(--purple-l)", color: "var(--purple-m)" }}>Perp</span>,
};

const OPP_BADGE = {
  "Audit Risk":   { bg: "#fff0f0", color: "var(--red-m)" },
  "GxP Expiring": { bg: "#fff0f0", color: "var(--red-m)" },
  "Renewal Due":  { bg: "var(--amber-l)", color: "var(--amber-m)" },
  "Right-Size":   { bg: "var(--green-l)", color: "var(--green-m)" },
  "Monitor":      { bg: "var(--blue-l)", color: "var(--blue-m)" },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function CostOptPage() {
  const [scorecard, setScorecard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScorecard()
      .then(setScorecard)
      .catch(() => setScorecard({ total_est_saving_inr: 0, total_risk_exposure_inr: 0, under_utilised_count: 0, renewal_actions_count: 0, items: [] }))
      .finally(() => setLoading(false));
  }, []);

  const sc = scorecard || {};
  const items = sc.items || [];
  const savingCr = sc.total_est_saving_inr
    ? (sc.total_est_saving_inr / 10_000_000).toFixed(2)
    : "0.00";

  // ── Layout: full viewport height, no page-level scroll ────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)", overflow: "hidden", padding: "18px 22px 0" }}>

      {/* ── Fixed: page header ─────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "var(--tx-q)", marginBottom: 4 }}>
          SAM Platform <span style={{ color: "var(--tx-m)" }}>›</span> Cost Optimisation
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 2 }}>Cost Optimisation Scorecard</h1>
        <p style={{ fontSize: 12.5, color: "var(--tx-m)" }}>
          CIO / CFO view — right-sizing opportunities · Unit Cost × (Entitled – In-Use)
        </p>
      </div>

      {/* ── Fixed: top hero cards ──────────────────────────────────────── */}
      <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>

        {/* Total savings — primary card */}
        <div style={{ background: "var(--navy-mid)", borderRadius: 10, padding: "20px 24px", color: "#fff" }}>
          <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.7, marginBottom: 8, letterSpacing: 0.5 }}>
            TOTAL IDENTIFIABLE SAVINGS
          </div>
          {loading ? (
            <div style={{ fontSize: 28, fontWeight: 700 }}>Loading…</div>
          ) : (
            <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 6 }}>₹{savingCr} Cr</div>
          )}
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            If all under-utilised licenses right-sized at next renewal
          </div>
        </div>

        {/* Coming soon cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "Savings Already Realised (YTD)", value: "₹— L", sub: "Requires License Harvest module (Phase 2)" },
            { label: "Harvest Pending", value: "— seats", sub: "Requires License Harvest module (Phase 2)" },
          ].map(card => (
            <div key={card.label} style={{ background: "var(--card)", border: "1px solid var(--bdr)", borderRadius: 8, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flex: 1 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", marginBottom: 4 }}>{card.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--tx-q)" }}>{card.value}</div>
                <div style={{ fontSize: 11, color: "var(--tx-q)", marginTop: 4 }}>{card.sub}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, background: "var(--bdr)", color: "var(--tx-q)", padding: "2px 8px", borderRadius: 3, flexShrink: 0 }}>
                Coming Soon — Phase 2
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Fixed: stat row ────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div style={{ border: "1px solid var(--bdr)", borderRadius: 8, padding: "12px 16px", borderLeft: "3px solid var(--teal-m)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx-q)", letterSpacing: 0.5, marginBottom: 4 }}>UNDER-UTILISED</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{loading ? "—" : sc.under_utilised_count ?? 0}</div>
          <div style={{ fontSize: 11, color: "var(--teal-m)", marginTop: 2 }}>Below 85%</div>
        </div>
        <div style={{ border: "1px solid var(--bdr)", borderRadius: 8, padding: "12px 16px", borderLeft: "3px solid var(--green-m)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx-q)", letterSpacing: 0.5, marginBottom: 4 }}>RENEWAL ACTIONS</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{loading ? "—" : sc.renewal_actions_count ?? 0}</div>
          <div style={{ fontSize: 11, color: "var(--green-m)", marginTop: 2 }}>Right-size before renewal</div>
        </div>
        <div style={{ border: "1px solid var(--bdr)", borderRadius: 8, padding: "12px 16px", borderLeft: "3px solid var(--red-m)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx-q)", letterSpacing: 0.5, marginBottom: 4 }}>RISK EXPOSURE</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--red-m)" }}>{loading ? "—" : fmtINR(sc.total_risk_exposure_inr)}</div>
          <div style={{ fontSize: 11, color: "var(--tx-q)", marginTop: 2 }}>Unlicensed overage cost</div>
        </div>
      </div>

      {/* ── Fixed: table section label ─────────────────────────────────── */}
      <div style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: "var(--tx-q)", textTransform: "uppercase", marginBottom: 6 }}>
        All Savings Opportunities — By Priority &amp; Annual Value
      </div>

      {/* ── Scrollable: table (both axes) ──────────────────────────────── */}
      <div style={{ flex: 1, overflow: "auto", borderRadius: 8, border: "1px solid var(--bdr)", marginBottom: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead>
            <tr style={{ background: "var(--surf)" }}>
              {["PRIORITY","SW_ID","SOFTWARE","PUBLISHER","TYPE","METRIC","ENTITLED","IN-USE","IDLE","UTIL %","UNIT COST (₹)","EST. ANNUAL SAVING","NEXT RENEWAL","OPPORTUNITY"].map(col => (
                <th key={col} style={{
                  position: "sticky", top: 0, zIndex: 2,
                  background: "var(--surf)", borderBottom: "2px solid var(--bdr)",
                  padding: "9px 12px", fontSize: 10, fontWeight: 700,
                  color: "var(--tx-q)", textTransform: "uppercase", letterSpacing: 0.5,
                  whiteSpace: "nowrap", textAlign: col === "ENTITLED" || col === "IN-USE" || col === "IDLE" || col === "UTIL %" || col === "UNIT COST (₹)" || col === "EST. ANNUAL SAVING" ? "right" : "left",
                }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan="14" style={{ textAlign: "center", padding: 24, color: "var(--tx-q)", fontSize: 13 }}>Loading…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan="14" style={{ textAlign: "center", padding: 24, color: "var(--tx-q)", fontSize: 13 }}>
                No optimisation opportunities found. Run reconciliation first to compute utilisation statuses.
              </td></tr>
            )}
            {items.map((item, idx) => {
              const opp = OPP_BADGE[item.opportunity_tag] || {};
              return (
                <tr key={item.ent_id} style={{ borderBottom: "1px solid var(--bdr)" }}>

                  {/* Priority */}
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                      color: idx < 3 ? "var(--red-m)" : idx < 6 ? "var(--amber-m)" : "var(--tx-q)",
                    }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: idx < 3 ? "var(--red-m)" : idx < 6 ? "var(--amber-m)" : "var(--bdr-s)",
                      }} />
                      P{idx + 1}
                    </div>
                  </td>

                  {/* SW_ID */}
                  <td style={{ padding: "10px 12px", fontSize: 11, color: "var(--tx-m)", whiteSpace: "nowrap" }}>
                    {item.sw_id}
                  </td>

                  {/* Software name */}
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{item.canonical_name}</div>
                    {item.contract_name && item.contract_name !== item.canonical_name && (
                      <div style={{ fontSize: 11, color: "var(--tx-q)" }}>{item.contract_name}</div>
                    )}
                  </td>

                  {/* Publisher */}
                  <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--tx-m)", whiteSpace: "nowrap" }}>
                    {item.publisher || "—"}
                  </td>

                  {/* Type badge */}
                  <td style={{ padding: "10px 12px" }}>
                    {TYPE_BADGE[item.license_type] ?? item.license_type}
                  </td>

                  {/* Metric */}
                  <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--tx-m)", whiteSpace: "nowrap" }}>
                    {item.metric_name || "—"}
                  </td>

                  {/* Entitled */}
                  <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 12 }}>
                    {item.entitled_count?.toLocaleString() ?? "—"}
                  </td>

                  {/* In-Use */}
                  <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 12 }}>
                    {item.in_use_count?.toLocaleString() ?? "—"}
                  </td>

                  {/* Idle */}
                  <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 12, color: item.idle_count > 0 ? "var(--teal-m)" : "var(--tx-q)" }}>
                    {item.idle_count?.toLocaleString() ?? "—"}
                  </td>

                  {/* Util % */}
                  <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 12, fontWeight: 600,
                    color: item.util_pct > 100 ? "var(--red-m)" : item.util_pct > 90 ? "var(--amber-m)" : "var(--tx-m)" }}>
                    {item.util_pct != null ? `${item.util_pct}%` : "—"}
                  </td>

                  {/* Unit cost */}
                  <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 12 }}>
                    {item.unit_cost_inr ? `₹${item.unit_cost_inr.toLocaleString("en-IN")}` : "—"}
                  </td>

                  {/* Est. annual saving */}
                  <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 12,
                    fontWeight: item.est_annual_saving_inr > 0 ? 700 : 400,
                    color: item.status === "OVER_DEPLOYED" ? "var(--red-m)" : item.est_annual_saving_inr > 0 ? "var(--green-m)" : "var(--tx-q)" }}>
                    {item.est_annual_saving_inr > 0
                      ? (item.status === "OVER_DEPLOYED"
                          ? `${fmtINR(item.est_annual_saving_inr)} exposure`
                          : fmtINR(item.est_annual_saving_inr))
                      : item.status === "OVER_DEPLOYED" ? "Audit risk" : "—"}
                  </td>

                  {/* Next renewal */}
                  <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--tx-m)", whiteSpace: "nowrap" }}>
                    {fmtDate(item.renewal_date)}
                  </td>

                  {/* Opportunity tag */}
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    {item.opportunity_tag ? (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 3,
                        background: opp.bg || "var(--bdr)", color: opp.color || "var(--tx-m)" }}>
                        {item.opportunity_tag}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Sticky bottom: AI insight bar ──────────────────────────────── */}
      {!loading && items.length > 0 && (
        <div style={{
          flexShrink: 0, background: "var(--navy-mid)", color: "#fff",
          borderRadius: 8, padding: "9px 16px", fontSize: 12, marginBottom: 12,
        }}>
          💡 <strong>Top opportunities: </strong>
          {items.slice(0, 3).map((item, i) => (
            <span key={item.ent_id}>
              {i > 0 && " · "}
              {item.canonical_name} → {item.est_annual_saving_inr > 0
                ? (item.status === "OVER_DEPLOYED"
                    ? fmtINR(item.est_annual_saving_inr) + " exposure"
                    : fmtINR(item.est_annual_saving_inr) + "/yr")
                : "audit required"}
            </span>
          ))}
          {sc.total_est_saving_inr > 0 && (
            <span> — Combined: <strong>{fmtINR(sc.total_est_saving_inr)}</strong> if actioned at next renewal cycle.</span>
          )}
        </div>
      )}
    </div>
  );
}
