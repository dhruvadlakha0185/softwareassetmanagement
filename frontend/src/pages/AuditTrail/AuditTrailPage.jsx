import { useState, useEffect, useCallback } from "react";
import { fetchAudit, exportAudit } from "../../api/audit";

const ACTION_BADGE = {
  CATALOG_CREATED:     <span className="tag tg2">Created</span>,
  CATALOG_UPDATED:     <span className="tag tb3">Updated</span>,
  ENTITLEMENT_UPDATED: <span className="tag tb3">Updated</span>,
  SOFTWARE_ONBOARDED:  <span className="tag tg2">Onboarded</span>,
  RECONCILIATION_RUN:  <span className="tag tp2">Recon Run</span>,
  USAGE_UPLOADED:      <span className="tag ta2">Upload</span>,
};

export default function AuditTrailPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEntityType, setFilterEntityType] = useState("");
  const [filterActionType, setFilterActionType] = useState("");
  const [filterSwId, setFilterSwId] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [exporting, setExporting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterEntityType) params.entity_type = filterEntityType;
      if (filterActionType) params.action_type = filterActionType;
      if (filterSwId) params.sw_id = filterSwId;
      setEntries(await fetchAudit(params));
    } finally {
      setLoading(false);
    }
  }, [filterEntityType, filterActionType, filterSwId]);

  useEffect(() => { reload(); }, [reload]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportAudit({
        entity_type: filterEntityType || undefined,
        sw_id: filterSwId || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit_trail_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)", overflow: "hidden", padding: "18px 22px 0" }}>

      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "var(--tx-q)", marginBottom: 4 }}>
          SAM Platform <span style={{ color: "var(--tx-m)" }}>›</span> Audit Trail
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 2 }}>Audit Trail</h1>
        <p style={{ fontSize: 12.5, color: "var(--tx-m)" }}>
          Append-only · tamper-evident · GxP 21 CFR Part 11 compliant · {entries.length} entries
        </p>
      </div>

      {/* Filter bar — single line, no wrap */}
      <div style={{ flexShrink: 0, display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
        <input
          className="fi2" style={{ flex: "1 1 200px", minWidth: 160 }}
          value={filterSwId}
          onChange={e => setFilterSwId(e.target.value)}
          placeholder="SW_ID filter…"
        />
        <select className="fi2" style={{ flex: "0 0 155px" }} value={filterEntityType} onChange={e => setFilterEntityType(e.target.value)}>
          <option value="">All Entities</option>
          <option value="software_catalog">Software Catalog</option>
          <option value="entitlement">Entitlement</option>
          <option value="reconciliation_run">Reconciliation</option>
        </select>
        <select className="fi2" style={{ flex: "0 0 155px" }} value={filterActionType} onChange={e => setFilterActionType(e.target.value)}>
          <option value="">All Actions</option>
          <option value="CATALOG_CREATED">Catalog Created</option>
          <option value="CATALOG_UPDATED">Catalog Updated</option>
          <option value="ENTITLEMENT_UPDATED">Entitlement Updated</option>
          <option value="SOFTWARE_ONBOARDED">Software Onboarded</option>
          <option value="RECONCILIATION_RUN">Reconciliation Run</option>
        </select>
        <button className="btn btn-o btn-sm" style={{ flex: "0 0 auto", whiteSpace: "nowrap" }} onClick={handleExport} disabled={exporting}>
          {exporting ? "Exporting…" : "⬇ Export XLSX"}
        </button>
      </div>

      {/* Table — fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", borderRadius: 8, border: "1px solid var(--bdr)", marginBottom: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ background: "var(--surf)" }}>
              {["Timestamp (UTC)","Action","Entity","Entity ID","SW_ID","GxP","Reason","Details"].map(h => (
                <th key={h} style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--surf)", borderBottom: "2px solid var(--bdr)", padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "var(--tx-q)", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="8" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {entries.map(e => (
              <>
                <tr
                  key={e.id}
                  style={{ cursor: (e.after_values_json || e.before_values_json) ? "pointer" : "default" }}
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                >
                  <td style={{ fontSize: 11, color: "var(--tx-m)" }}>
                    {new Date(e.created_at_utc).toLocaleString()}
                  </td>
                  <td>{ACTION_BADGE[e.action_type] ?? <span className="tag tg3">{e.action_type}</span>}</td>
                  <td style={{ fontSize: 11.5 }}>{e.entity_type}</td>
                  <td style={{ fontSize: 11 }}>{e.entity_id || "—"}</td>
                  <td style={{ fontSize: 11 }}>{e.sw_id || "—"}</td>
                  <td>
                    {e.is_gxp
                      ? <span className="tag tb3">GxP</span>
                      : <span style={{ color: "var(--tx-q)", fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{e.reason_for_change || "—"}</td>
                  <td style={{ fontSize: 11, color: "var(--tx-q)" }}>
                    {(e.after_values_json || e.before_values_json) ? "▼ view" : ""}
                  </td>
                </tr>
                {expanded === e.id && (
                  <tr key={`${e.id}-exp`}>
                    <td colSpan="8" style={{ background: "var(--bg2)", padding: "8px 14px", fontSize: 11 }}>
                      {e.before_values_json && (
                        <div style={{ marginBottom: 4 }}>
                          <strong>Before:</strong>{" "}
                          <code style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(e.before_values_json, null, 2)}</code>
                        </div>
                      )}
                      {e.after_values_json && (
                        <div>
                          <strong>After:</strong>{" "}
                          <code style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(e.after_values_json, null, 2)}</code>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan="8" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>
                  No audit entries. Actions (create/update/onboard/reconcile) will appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
