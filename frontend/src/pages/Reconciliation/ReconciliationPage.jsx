import { useState, useEffect } from "react";
import { triggerRun, fetchLatestRun, fetchRuns } from "../../api/reconciliation";

// ── Status badges — same style as Entitlements page ───────────────────────────
const STATUS_STYLE = {
  ACTIVE:         { bg: "var(--green-l)",  color: "var(--green-m)",  label: "Active" },
  OK:             { bg: "var(--green-l)",  color: "var(--green-m)",  label: "OK" },
  WATCH:          { bg: "var(--amber-l)",  color: "var(--amber-m)",  label: "Watch" },
  OVER_DEPLOYED:  { bg: "#fff0f0",         color: "var(--red-m)",    label: "Over-Deployed" },
  UNDER_UTILISED: { bg: "var(--blue-l)",   color: "var(--teal-m)",   label: "Under-Utilised" },
  EXPIRED:        { bg: "var(--bdr)",      color: "var(--tx-m)",     label: "Expired" },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status];
  if (!s) return <span style={{ fontSize: 11, color: "var(--tx-q)" }}>{status ?? "—"}</span>;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 3,
      background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

// ── AI recommendation cell ─────────────────────────────────────────────────────
const AI_STYLE = {
  OVER_DEPLOYED:  { bg: "#fff0f0",        color: "var(--red-m)",   label: null },
  UNDER_UTILISED: { bg: "var(--blue-l)",  color: "var(--teal-m)",  label: null },
  OK:             { bg: null,             color: "var(--tx-q)",    label: "No action required at this stage" },
  WATCH:          { bg: null,             color: "var(--tx-q)",    label: "No action required at this stage" },
};

function AICell({ status, text }) {
  const s = AI_STYLE[status];
  const isHighlighted = status === "OVER_DEPLOYED" || status === "UNDER_UTILISED";
  const displayText = text || s?.label;

  if (!displayText) return <span style={{ color: "var(--tx-q)", fontSize: 11 }}>—</span>;

  if (!isHighlighted) {
    return (
      <span style={{ fontSize: 11, color: s?.color || "var(--tx-q)", fontStyle: "italic" }}>
        {s?.label}
      </span>
    );
  }

  return (
    <div style={{
      background: s.bg, borderRadius: 4, padding: "5px 8px",
      fontSize: 11, color: s.color, lineHeight: 1.6,
    }}>
      {displayText}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReconciliationPage() {
  const [latestRun, setLatestRun] = useState(null);
  const [runs, setRuns] = useState([]);
  const [running, setRunning] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(true);

  const loadLatest = async () => {
    setLoadingLatest(true);
    try {
      const data = await fetchLatestRun();
      setLatestRun(data);
    } catch {
      setLatestRun(null);
    } finally {
      setLoadingLatest(false);
    }
  };

  useEffect(() => {
    loadLatest();
    fetchRuns().then(setRuns).catch(() => {});
  }, []);

  const handleRun = async () => {
    setRunning(true);
    try {
      const result = await triggerRun();
      setLatestRun(result);
      fetchRuns().then(setRuns).catch(() => {});
    } catch (e) {
      alert(e?.response?.data?.detail || "Reconciliation failed");
    } finally {
      setRunning(false);
    }
  };

  const STATUS_ORDER = { OVER_DEPLOYED: 0, UNDER_UTILISED: 1, WATCH: 2, OK: 3, ACTIVE: 4, EXPIRED: 5 };
  const results = [...(latestRun?.results || [])].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
  );

  const COLS = [
    { key: "ent_id",         label: "ENT ID",         w: 90  },
    { key: "sw_id",          label: "SW ID",          w: 80  },
    { key: "canonical_name", label: "Software Name",  w: 160 },
    { key: "publisher",      label: "Publisher",      w: 120 },
    { key: "category_name",  label: "Category",       w: 120 },
    { key: "metric_name",    label: "Metric",         w: 100 },
    { key: "region_name",    label: "Region",         w: 90  },
    { key: "entitled",       label: "Entitled",       w: 85,  center: true },
    { key: "in_use",         label: "In-Use",         w: 85,  center: true },
    { key: "delta",          label: "Delta",          w: 80,  center: true },
    { key: "util_pct",       label: "Util %",         w: 90  },
    { key: "status",         label: "Status",         w: 130 },
    { key: "ai_rec",         label: "AI Recommendation", w: 280 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)",
      overflow: "hidden", padding: "18px 22px 0" }}>

      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "var(--tx-q)", marginBottom: 4 }}>
          SAM Platform <span style={{ color: "var(--tx-m)" }}>›</span> Reconciliation
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 2 }}>License Reconciliation</h1>
        <p style={{ fontSize: 12.5, color: "var(--tx-m)" }}>
          Entitled vs in-use · AI recommendations · {results.length} entitlements in last run
        </p>
      </div>

      {/* Action bar */}
      <div style={{ flexShrink: 0, display: "flex", gap: 12, marginBottom: 14, alignItems: "center" }}>
        <button className="btn btn-p" onClick={handleRun} disabled={running} style={{ whiteSpace: "nowrap" }}>
          {running ? "Running…" : "▶ Run Reconciliation Now"}
        </button>
        {latestRun && (
          <span style={{ fontSize: 12, color: "var(--tx-m)" }}>
            Last run: {new Date(latestRun.run.run_date).toLocaleString("en-IN")} · {latestRun.run.entitlements_processed} processed
          </span>
        )}
      </div>

      {loadingLatest && (
        <div style={{ flexShrink: 0, color: "var(--tx-q)", fontSize: 13, marginBottom: 14 }}>Loading last run…</div>
      )}

      {/* Results table */}
      {results.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", borderRadius: 8,
          border: "1px solid var(--bdr)", marginBottom: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1400 }}>
            <thead>
              <tr style={{ background: "var(--surf)" }}>
                {COLS.map(col => (
                  <th key={col.key} style={{
                    position: "sticky", top: 0, zIndex: 2,
                    background: "var(--surf)", borderBottom: "2px solid var(--bdr)",
                    padding: "8px 12px", fontSize: 10, fontWeight: 700,
                    color: "var(--tx-q)", textTransform: "uppercase", letterSpacing: 0.5,
                    whiteSpace: "nowrap", textAlign: col.center ? "center" : "left",
                    minWidth: col.w, width: col.w,
                  }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map(r => {
                const delta = (r.entitled != null && r.in_use != null)
                  ? r.entitled - r.in_use : null;
                const pct = r.util_pct;

                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--bdr)" }}>

                    {/* ENT ID */}
                    <td style={{ padding: "9px 12px" }}>
                      <code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>
                        {r.ent_id}
                      </code>
                    </td>

                    {/* SW ID */}
                    <td style={{ padding: "9px 12px" }}>
                      {r.sw_id
                        ? <code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{r.sw_id}</code>
                        : <span style={{ color: "var(--tx-q)" }}>—</span>}
                    </td>

                    {/* Software Name */}
                    <td style={{ padding: "9px 12px", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>
                      {r.canonical_name || "—"}
                    </td>

                    {/* Publisher */}
                    <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--tx-m)", whiteSpace: "nowrap" }}>
                      {r.publisher || "—"}
                    </td>

                    {/* Category */}
                    <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--tx-m)", whiteSpace: "nowrap" }}>
                      {r.category_name || "—"}
                    </td>

                    {/* Metric */}
                    <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--tx-m)", whiteSpace: "nowrap" }}>
                      {r.metric_name || "—"}
                    </td>

                    {/* Region */}
                    <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--tx-m)", whiteSpace: "nowrap" }}>
                      {r.region_name || "—"}
                    </td>

                    {/* Entitled — centre aligned */}
                    <td style={{ padding: "9px 12px", textAlign: "center", fontSize: 12 }}>
                      {r.entitled?.toLocaleString() ?? "—"}
                    </td>

                    {/* In-Use — centre aligned */}
                    <td style={{ padding: "9px 12px", textAlign: "center", fontSize: 12 }}>
                      {r.in_use?.toLocaleString() ?? "—"}
                    </td>

                    {/* Delta — centre aligned, coloured */}
                    <td style={{ padding: "9px 12px", textAlign: "center", fontSize: 12, fontWeight: 600,
                      color: delta == null ? "var(--tx-q)" : delta < 0 ? "var(--red-m)" : delta > 0 ? "var(--teal-m)" : "var(--tx-m)" }}>
                      {delta == null ? "—" : delta > 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()}
                    </td>

                    {/* Util % — bar + number */}
                    <td style={{ padding: "9px 12px" }}>
                      {pct == null ? (
                        <span style={{ color: "var(--tx-q)", fontSize: 11 }}>—</span>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 52, height: 5, background: "var(--bdr)", borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
                            <div style={{
                              width: `${Math.min(pct, 100)}%`, height: "100%", borderRadius: 3,
                              background: pct > 100 ? "var(--red-m)" : pct > 90 ? "var(--amber-m)" : pct < 30 ? "var(--teal-m)" : "var(--green-m)",
                            }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600,
                            color: pct > 100 ? "var(--red-m)" : pct > 90 ? "var(--amber-m)" : "var(--tx-m)" }}>
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Status badge */}
                    <td style={{ padding: "9px 12px" }}>
                      <StatusBadge status={r.status} />
                    </td>

                    {/* AI Recommendation */}
                    <td style={{ padding: "9px 12px" }}>
                      <AICell status={r.status} text={r.ai_recommendation} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loadingLatest && results.length === 0 && (
        <div style={{ flexShrink: 0, background: "var(--surf)", border: "1px solid var(--bdr)",
          borderRadius: 8, padding: 24, textAlign: "center", color: "var(--tx-q)", fontSize: 13 }}>
          No reconciliation runs yet. Click "Run Reconciliation Now" to start.
        </div>
      )}

      {/* Last run summary */}
      {runs.length > 0 && (
        <div style={{ flexShrink: 0, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx-q)", letterSpacing: 0.8,
            textTransform: "uppercase", marginBottom: 6 }}>
            Last Run
          </div>
          {(() => { const r = runs[0]; return (
            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--tx-m)",
              padding: "6px 12px", background: "var(--surf)", borderRadius: 6,
              border: "1px solid var(--bdr)", width: "fit-content" }}>
              <span>{new Date(r.run_date).toLocaleString("en-IN")}</span>
              <span style={{ color: "var(--tx-q)" }}>{r.entitlements_processed} processed</span>
            </div>
          ); })()}
        </div>
      )}
    </div>
  );
}
