import { useState, useEffect } from "react";
import { triggerRun, fetchLatestRun, fetchRuns } from "../../api/reconciliation";

const STATUS_BADGE = {
  OVER_DEPLOYED:  <span className="tag tgr2">Over-Deployed</span>,
  WATCH:          <span className="tag tg4">Watch</span>,
  OK:             <span className="tag tg2">OK</span>,
  UNDER_UTILISED: <span className="tag tg3">Under-Utilised</span>,
};

function UtilBar({ pct }) {
  if (pct === null || pct === undefined) return <span style={{ color: "var(--tx-q)", fontSize: 11 }}>—</span>;
  const color = pct > 100 ? "var(--red)" : pct > 90 ? "var(--amber-m)" : pct < 30 ? "var(--teal-m)" : "var(--green, #00a651)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 60, height: 6, background: "var(--bdr)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 600 }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

export default function ReconciliationPage() {
  const [latestRun, setLatestRun] = useState(null);
  const [runs, setRuns] = useState([]);
  const [running, setRunning] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

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

  const results = latestRun?.results || [];

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> Reconciliation</div>
        <h1>License Reconciliation</h1>
        <p>Entitled vs. in-use · AI recommendations · {results.length} entitlements in last run</p>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <button className="btn btn-p" onClick={handleRun} disabled={running}>
          {running ? "Running…" : "▶ Run Reconciliation Now"}
        </button>
        {latestRun && (
          <span style={{ fontSize: 12, color: "var(--tx-m)" }}>
            Last run: {new Date(latestRun.run.run_date).toLocaleString()} · {latestRun.run.entitlements_processed} processed
          </span>
        )}
      </div>

      {loadingLatest && <div style={{ color: "var(--tx-q)", fontSize: 13 }}>Loading last run…</div>}

      {results.length > 0 && (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>ENT_ID</th><th>Entitled</th><th>In Use</th><th>Util</th>
                <th>Status</th><th>AI Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.id}>
                  <td><code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{r.ent_id}</code></td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>{r.entitled?.toLocaleString() ?? "—"}</td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>{r.in_use?.toLocaleString() ?? "—"}</td>
                  <td><UtilBar pct={r.util_pct} /></td>
                  <td>{STATUS_BADGE[r.status] ?? r.status ?? "—"}</td>
                  <td style={{ fontSize: 11, color: "var(--tx-m)", maxWidth: 320 }}>
                    {r.ai_recommendation ? (
                      <div
                        style={{
                          cursor: "pointer",
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: expandedId === r.id ? "unset" : 2,
                          WebkitBoxOrient: "vertical",
                        }}
                        onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                        title="Click to expand"
                      >
                        {r.ai_recommendation}
                      </div>
                    ) : <span style={{ color: "var(--tx-q)" }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loadingLatest && results.length === 0 && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 24, textAlign: "center", color: "var(--tx-q)" }}>
          No reconciliation runs yet. Click "Run Reconciliation Now" to start.
        </div>
      )}

      {runs.length > 1 && (
        <>
          <div className="sdiv" style={{ marginTop: 24 }}>Run History ({runs.length})</div>
          <div className="tw">
            <table>
              <thead><tr><th>Run Date</th><th>Entitlements Processed</th></tr></thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12 }}>{new Date(r.run_date).toLocaleString()}</td>
                    <td style={{ textAlign: "right", fontSize: 12 }}>{r.entitlements_processed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
