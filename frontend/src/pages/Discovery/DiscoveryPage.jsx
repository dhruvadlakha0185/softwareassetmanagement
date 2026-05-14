import { useState, useEffect, useCallback, useRef } from "react";
import { fetchDiscovery, ingestDiscovery } from "../../api/discovery";

const MATCH_BADGE = {
  matched:   <span className="tag tg2">Matched</span>,
  unmatched: <span className="tag tgr2">Unmatched</span>,
};

export default function DiscoveryPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMatched, setFilterMatched] = useState("");
  const [ingestResult, setIngestResult] = useState(null);
  const [ingesting, setIngesting] = useState(false);
  const fileInputRef = useRef(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterMatched === "true") params.matched = true;
      if (filterMatched === "false") params.matched = false;
      setRecords(await fetchDiscovery(params));
    } finally {
      setLoading(false);
    }
  }, [filterMatched]);

  useEffect(() => { reload(); }, [reload]);

  const handleIngest = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIngesting(true);
    setIngestResult(null);
    try {
      const result = await ingestDiscovery(file);
      setIngestResult(result);
      reload();
    } catch (err) {
      setIngestResult({ error: err?.response?.data?.detail || "Ingest failed" });
    } finally {
      setIngesting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const matchedCount = records.filter(r => r.sw_id).length;
  const unmatchedCount = records.filter(r => !r.sw_id).length;

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> License Discovery</div>
        <h1>License Discovery</h1>
        <p>{records.length} records · {matchedCount} matched · {unmatchedCount} unmatched</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
        <select className="fi2" value={filterMatched} onChange={e => setFilterMatched(e.target.value)}>
          <option value="">All Records</option>
          <option value="true">Matched Only</option>
          <option value="false">Unmatched Only</option>
        </select>
        <div style={{ flex: 1 }} />
        <label className="btn btn-p btn-sm" style={{ cursor: "pointer" }}>
          {ingesting ? "Ingesting…" : "⬆ Ingest CSV / XLSX"}
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={handleIngest} disabled={ingesting} />
        </label>
      </div>

      {/* Ingest result banner */}
      {ingestResult && (
        <div style={{
          background: ingestResult.error ? "#fff0f0" : "var(--navy-xlt)",
          border: "1px solid var(--bdr)", borderRadius: 6, padding: "8px 12px",
          marginBottom: 12, fontSize: 12,
        }}>
          {ingestResult.error ? (
            <span style={{ color: "var(--red)" }}>{ingestResult.error}</span>
          ) : (
            <>
              <strong>Ingest complete</strong> — {ingestResult.inserted} records inserted ·{" "}
              {ingestResult.matched} matched · {ingestResult.unmatched} unmatched
              {ingestResult.errors?.length > 0 && (
                <div style={{ color: "var(--amber-m)", marginTop: 4 }}>{ingestResult.errors.join("; ")}</div>
              )}
            </>
          )}
          <button style={{ float: "right", background: "none", border: "none", cursor: "pointer", fontSize: 12 }} onClick={() => setIngestResult(null)}>✕</button>
        </div>
      )}

      {/* CSV format hint */}
      <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 6, padding: "8px 12px", marginBottom: 14, fontSize: 11, color: "var(--tx-m)" }}>
        <strong>Expected columns:</strong> contract_name · device_id · device_type (endpoint/server) · os · version · last_seen (YYYY-MM-DD) · site
      </div>

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Disc ID</th><th>Contract Name</th><th>Matched SW</th>
              <th>Device ID</th><th>Type</th><th>OS</th><th>Version</th>
              <th>Last Seen</th><th>Site</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="9" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {records.map(rec => (
              <tr key={rec.disc_id}>
                <td><code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{rec.disc_id}</code></td>
                <td style={{ fontSize: 12 }}>{rec.contract_name}</td>
                <td>
                  {rec.sw_id
                    ? <>{MATCH_BADGE.matched} <span style={{ fontSize: 11, marginLeft: 4 }}>{rec.sw_id}</span></>
                    : MATCH_BADGE.unmatched}
                </td>
                <td style={{ fontSize: 11.5 }}>{rec.device_id || "—"}</td>
                <td style={{ fontSize: 11 }}>{rec.device_type || "—"}</td>
                <td style={{ fontSize: 11 }}>{rec.os || "—"}</td>
                <td style={{ fontSize: 11 }}>{rec.version || "—"}</td>
                <td style={{ fontSize: 11 }}>{rec.last_seen || "—"}</td>
                <td style={{ fontSize: 11 }}>{rec.site || "—"}</td>
              </tr>
            ))}
            {!loading && records.length === 0 && (
              <tr><td colSpan="9" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>No discovery records. Upload a CSV or XLSX to ingest.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
