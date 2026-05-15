import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchDashboardSummary } from "../../api/dashboard";

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtINR(inr) {
  if (!inr) return "—";
  if (inr >= 10_000_000) return `₹${(inr / 10_000_000).toFixed(2)} Cr`;
  if (inr >= 100_000)    return `₹${(inr / 100_000).toFixed(1)} L`;
  return `₹${inr.toLocaleString("en-IN")}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function now() {
  return new Date().toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
}

// ── Info tooltip ─────────────────────────────────────────────────────────────
function InfoTip({ text }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: 6, cursor: "help" }}
          className="info-tip">
      <span style={{
        width: 15, height: 15, borderRadius: "50%", background: "rgba(255,255,255,0.25)",
        color: "inherit", fontSize: 10, fontWeight: 700,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        border: "1px solid currentColor", flexShrink: 0,
      }}>ℹ</span>
      <span className="info-tip-text" style={{
        visibility: "hidden", opacity: 0, transition: "opacity 0.15s",
        position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
        transform: "translateX(-50%)",
        background: "var(--navy)", color: "#fff", fontSize: 11, lineHeight: 1.5,
        padding: "8px 10px", borderRadius: 6, width: 240, zIndex: 100,
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        pointerEvents: "none",
      }}>
        {text}
      </span>
      <style>{`.info-tip:hover .info-tip-text { visibility: visible !important; opacity: 1 !important; }`}</style>
    </span>
  );
}

// ── Util bar ─────────────────────────────────────────────────────────────────
function UtilBar({ pct, status }) {
  const color =
    status === "OVER_DEPLOYED"  ? "var(--red-m)" :
    status === "WATCH"          ? "var(--amber-m)" :
    status === "UNDER_UTILISED" ? "var(--blue-m)" :
                                  "var(--teal-m)";
  return (
    <div style={{ flex: 1, height: 8, background: "var(--bdr)", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 4 }} />
    </div>
  );
}

const STATUS_BADGE = {
  OVER_DEPLOYED:  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--red-m)", background: "var(--red-l)", padding: "1px 6px", borderRadius: 3 }}>RISK</span>,
  WATCH:          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--amber-m)", background: "var(--amber-l)", padding: "1px 6px", borderRadius: 3 }}>WATCH</span>,
  UNDER_UTILISED: <span style={{ fontSize: 10, fontWeight: 700, color: "var(--blue-m)", background: "var(--blue-l)", padding: "1px 6px", borderRadius: 3 }}>LOW</span>,
  OK:             <span style={{ fontSize: 10, fontWeight: 700, color: "var(--teal-m)", background: "var(--teal-l)", padding: "1px 6px", borderRadius: 3 }}>OK</span>,
};

// ── Spend bar chart (CSS-only, fixed layout) ──────────────────────────────────
function SpendChart({ items }) {
  if (!items?.length) {
    return (
      <div style={{ fontSize: 12, color: "var(--tx-q)", paddingTop: 8 }}>
        No spend data yet. Add unit/annual costs during onboarding.
      </div>
    );
  }

  const COLORS = ["var(--navy-mid)", "var(--blue-m)", "var(--teal-m)", "var(--purple-m)", "var(--amber-m)", "var(--accent)"];
  const max = Math.max(...items.map(i => i.total_inr));
  const BAR_MAX_H = 120; // max bar height in px — taller bars, less empty space

  const abbr = (name) => {
    const map = {
      "ERP & Supply Chain": "ERP",
      "R&D & Lab Informatics": "R&D",
      "Manufacturing Execution": "Mfg",
      "IT Security": "Sec",
      "Enterprise Productivity": "Prod",
      "IT Infrastructure": "Infra",
      "Quality & Compliance": "QA",
    };
    return map[name] || name.slice(0, 4);
  };

  return (
    /* paddingTop reserves space for value labels so they never overlap card title */
    <div style={{ paddingTop: 18, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: BAR_MAX_H + 20 }}>
        {items.map((item, i) => {
          const barH = Math.max(10, Math.round((item.total_inr / max) * BAR_MAX_H));
          return (
            <div
              key={i}
              title={`${item.category_name}: ${fmtINR(item.total_inr)}`}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}
            >
              {/* Value label sits just above its bar */}
              <div style={{ fontSize: 10, color: "var(--tx-q)", marginBottom: 3, whiteSpace: "nowrap" }}>
                {fmtINR(item.total_inr)}
              </div>
              <div style={{ width: "100%", height: barH, background: COLORS[i % COLORS.length], borderRadius: "3px 3px 0 0" }} />
            </div>
          );
        })}
      </div>
      {/* Category labels in a separate row below all bars */}
      <div style={{ display: "flex", gap: 10, marginTop: 6, borderTop: "1px solid var(--bdr)", paddingTop: 5 }}>
        {items.map((item, i) => (
          <div key={i} style={{ flex: 1, fontSize: 10, color: "var(--tx-m)", textAlign: "center" }}>
            {abbr(item.category_name)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshedAt] = useState(now());
  const navigate = useNavigate();

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
        </div>
        <div style={{ color: "var(--tx-q)", fontSize: 13 }}>Loading dashboard…</div>
      </div>
    );
  }

  const s = summary || {};
  const savingsCr = s.potential_savings_inr
    ? (s.potential_savings_inr / 10_000_000).toFixed(2)
    : "0.00";
  const underUtilisedCount = s.under_utilised_count || 0;

  return (
    <div className="page" style={{ paddingBottom: 32 }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> Dashboard</div>
        <h1>Software Asset Management</h1>
        <p>Dr. Reddy's Laboratories · Global Portfolio · Last refreshed: {refreshedAt}</p>
      </div>

      {/* ── Alert banner ──────────────────────────────────────────────────── */}
      {(s.over_deployed_count > 0 || s.expiring_30d_count > 0) && (
        <div style={{
          background: "var(--red-m)", color: "#fff", borderRadius: 8,
          padding: "12px 18px", marginBottom: 16,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20, marginTop: 1 }}>⚠</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {s.over_deployed_count > 0
                  ? `${s.over_deployed_count} Over-Deployed License${s.over_deployed_count > 1 ? "s" : ""} — Active Compliance Risk`
                  : `${s.expiring_30d_count} Contract${s.expiring_30d_count > 1 ? "s" : ""} Expiring in 30 Days`}
              </div>
              <div style={{ fontSize: 12, marginTop: 2, opacity: 0.9 }}>
                {s.over_deployed_count > 0
                  ? `${s.top_utilisation?.filter(u => u.status === "OVER_DEPLOYED").map(u => u.canonical_name).slice(0, 3).join(" · ") || "Review entitlements"} — Escalated to CIO & COE Head`
                  : "Renewal action required — check Contract Expiry Timeline below"}
              </div>
            </div>
          </div>
          <button
            className="btn"
            style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.4)", flexShrink: 0 }}
            onClick={() => navigate(s.over_deployed_count > 0 ? "/reconciliation" : "/entitlements")}
          >
            View →
          </button>
        </div>
      )}

      {/* ── 4 Metric cards ───────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>

        <div className="met ml-b" style={{ cursor: "pointer" }} onClick={() => navigate("/catalog")}>
          <div className="ml">Software Titles</div>
          <div className="mv">{s.total_sw ?? "—"}</div>
          <div className="ms">{s.gxp_summary?.total_gxp_titles ?? 0} GxP · {(s.total_sw ?? 0) - (s.gxp_summary?.total_gxp_titles ?? 0)} Non-GxP</div>
        </div>

        <div className="met" style={{ borderLeft: "3px solid var(--amber-m)", cursor: "pointer" }} onClick={() => navigate("/entitlements")}>
          <div className="ml">Active Entitlements</div>
          <div className="mv">{s.total_entitlements ?? "—"}</div>
          <div className="ms amb">
            {s.expiring_90d_count > 0 ? `${s.expiring_90d_count} expiring ≤90 days` : "No near-term expirations"}
          </div>
        </div>

        <div className="met" style={{ borderLeft: `3px solid ${s.over_deployed_count > 0 ? "var(--red-m)" : "var(--teal-m)"}`, cursor: "pointer" }} onClick={() => navigate("/reconciliation")}>
          <div className="ml">Over-Deployed</div>
          <div className="mv" style={{ color: s.over_deployed_count > 0 ? "var(--red-m)" : "inherit" }}>{s.over_deployed_count ?? "—"}</div>
          <div className={`ms ${s.over_deployed_count > 0 ? "red" : "grn"}`}>
            {s.over_deployed_count > 0 ? "Compliance risk" : "All within limits"}
          </div>
        </div>

        {/* Potential Savings — corrected calculation + ℹ️ tooltip */}
        <div className="met ml-g" style={{ cursor: "pointer" }} onClick={() => navigate("/cost-opt")}>
          <div className="ml" style={{ display: "flex", alignItems: "center" }}>
            Potential Savings
            <InfoTip text={
              `Unit Cost × Idle Seats, for all UNDER-UTILISED entitlements (utilisation < 30%).\n\n` +
              `Formula: Σ (unit_cost_inr × (entitled − in_use)) for each under-utilised license.\n\n` +
              `This is the max saving if all under-utilised licenses are right-sized at next renewal.`
            } />
          </div>
          <div className="mv">
            {s.potential_savings_inr > 0 ? `₹${savingsCr} Cr` : "—"}
          </div>
          <div className="ms grn">
            {underUtilisedCount > 0
              ? `${underUtilisedCount} under-utilised title${underUtilisedCount > 1 ? "s" : ""} · right-sizing opportunity`
              : "Run reconciliation to compute"}
          </div>
        </div>

      </div>

      {/* ── Row 2: Utilisation + Contract Expiry ─────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>

        <div className="card">
          <div className="ch">
            <div>
              <div className="ct">License Utilisation — Top Titles</div>
              <div className="csub">Entitled vs. in-use · sorted by utilisation %</div>
            </div>
          </div>
          {s.top_utilisation?.length > 0 ? s.top_utilisation.map(u => (
            <div key={u.ent_id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 140, fontSize: 12, fontWeight: 500, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                   title={u.canonical_name}>{u.canonical_name}</div>
              <UtilBar pct={u.util_pct} status={u.status} />
              <div style={{ fontSize: 11, color: "var(--tx-m)", width: 72, textAlign: "right", flexShrink: 0 }}>
                {u.in_use_count.toLocaleString()}/{u.entitled_count.toLocaleString()}
              </div>
              <div style={{ width: 44, flexShrink: 0, textAlign: "right" }}>
                {STATUS_BADGE[u.status] ?? <span style={{ fontSize: 10 }}>{u.status}</span>}
              </div>
            </div>
          )) : (
            <div style={{ color: "var(--tx-q)", fontSize: 12 }}>
              No utilisation data yet. Update in-use counts or run Reconciliation.
            </div>
          )}
        </div>

        <div className="card">
          <div className="ch"><div className="ct">Contract Expiry Timeline</div></div>
          {s.expiring_contracts?.length > 0 ? s.expiring_contracts.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 12, marginBottom: 14, paddingBottom: 14, borderBottom: i < s.expiring_contracts.length - 1 ? "1px solid var(--bdr)" : "none" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.days_to_expiry <= 7 ? "var(--red-m)" : c.days_to_expiry <= 30 ? "var(--amber-m)" : "var(--tx-q)", marginTop: 4, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "var(--tx-q)", marginBottom: 2 }}>
                  {fmtDate(c.end_date)} · T-{c.days_to_expiry} days
                  {c.is_gxp && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "var(--red-m)" }}>⬛ GxP Critical</span>}
                </div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{c.canonical_name}</div>
                <div style={{ fontSize: 11.5, color: "var(--tx-m)", marginTop: 2 }}>
                  {c.contract_name && `${c.contract_name} · `}
                  {c.total_value_inr ? `${fmtINR(c.total_value_inr)}/yr · ` : ""}
                  {c.auto_renewal_clause === "yes" ? "Auto-renews" : c.auto_renewal_clause === "opt_in" ? "Opt-in renewal" : c.auto_renewal_clause === "no" ? "Renewal not initiated" : ""}
                </div>
              </div>
            </div>
          )) : (
            <div style={{ color: "var(--tx-q)", fontSize: 12 }}>
              No upcoming contract expirations within 1 year.
            </div>
          )}
        </div>

      </div>

      {/* ── Row 3: Spend by Category + GxP Status + Shadow IT ───────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>

        {/* Spend by Category */}
        <div className="card">
          <div className="ch"><div className="ct">Spend by Category</div></div>
          <SpendChart items={s.spend_by_category} />
        </div>

        {/* GxP Software Status */}
        <div className="card">
          <div className="ch">
            <div className="ct" style={{ display: "flex", alignItems: "center" }}>
              GxP Software Status
              <InfoTip text={
                "GxP software requires compliance with pharmaceutical regulations:\n\n" +
                "• 21 CFR Part 11 (US FDA) — electronic records & signatures validation for US operations\n" +
                "• Annex 11 (EU EMA) — computerised systems validation for EU manufacturing\n" +
                "• Both — software validated under both frameworks (global operations)\n\n" +
                "Counts are derived from the gxp_flag field set in the Software Catalog."
              } />
            </div>
          </div>
          {s.gxp_summary ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <tbody>
                {[
                  ["Total GxP Titles",  s.gxp_summary.total_gxp_titles, "var(--blue-m)",   "All SW with any GxP flag set"],
                  ["21 CFR Part 11",    s.gxp_summary.cfr_21_count,    "var(--teal-m)",   "FDA 21 CFR Part 11 — US operations"],
                  ["Annex 11 (EU)",     s.gxp_summary.annex11_count,   "var(--teal-m)",   "EU EMA Annex 11 — European sites"],
                  ["Both Frameworks",  s.gxp_summary.both_count,      "var(--purple-m)", "Validated under both CFR + Annex 11"],
                  ["Non-GxP",          s.gxp_summary.non_gxp_count,   "var(--tx-q)",     "Not subject to GxP validation"],
                ].map(([label, count, color, hint]) => (
                  <tr key={label} style={{ borderBottom: "1px solid var(--bdr)" }} title={hint}>
                    <td style={{ padding: "7px 0", color: "var(--tx-m)" }}>{label}</td>
                    <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 700, color }}>
                      {count} {count === 1 ? "title" : "titles"}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: "7px 0", color: "var(--tx-m)" }}>21 CFR Part 11 Coverage</td>
                  <td style={{ padding: "7px 0", textAlign: "right" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--teal-m)", background: "var(--teal-l)", padding: "2px 7px", borderRadius: 3 }}>
                      {s.gxp_summary.total_gxp_titles > 0 ? "Active" : "None"}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          ) : <div style={{ fontSize: 12, color: "var(--tx-q)" }}>Loading…</div>}
        </div>

        {/* Shadow IT */}
        <div className="card">
          <div className="ch" style={{ marginBottom: 10 }}>
            <div className="ct" style={{ display: "flex", alignItems: "center" }}>
              Shadow IT
              <InfoTip text={
                "Shadow IT = software found on endpoints during discovery scans that does NOT match any entry in the Software Catalog.\n\n" +
                "These are unlicensed, unapproved, or untracked applications — a compliance and security risk.\n\n" +
                "Source: Discovery records where sw_id IS NULL (contract name doesn't match any canonical SW entry)."
              } />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, background: "var(--bdr)", color: "var(--tx-q)", padding: "2px 8px", borderRadius: 3 }}>Phase 2</span>
          </div>
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontSize: 32, color: "var(--bdr)", marginBottom: 10 }}>◷</div>
            <div style={{ fontSize: 12, color: "var(--tx-q)", lineHeight: 1.6, marginBottom: 12 }}>
              Full Shadow IT Triage (risk scoring, auto-block recommendations) is planned for Phase 2.
            </div>
            {(s.total_discovery_records ?? 0) > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ background: "var(--red-l)", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: "var(--red-m)", fontSize: 18 }}>
                    {(s.total_discovery_records ?? 0) - (s.matched_discovery_count ?? 0)}
                  </span>
                  <span style={{ color: "var(--red-m)", marginLeft: 6 }}>unmatched discovery records</span>
                </div>
                <div style={{ background: "var(--green-l)", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: "var(--green-m)", fontSize: 18 }}>
                    {s.matched_discovery_count ?? 0}
                  </span>
                  <span style={{ color: "var(--green-m)", marginLeft: 6 }}>matched to SW catalog</span>
                </div>
                <button className="btn btn-o btn-sm" style={{ width: "100%", marginTop: 4 }} onClick={() => navigate("/discovery")}>
                  View All Discovery Records →
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
