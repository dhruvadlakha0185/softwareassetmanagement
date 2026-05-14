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
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> Audit Trail</div>
        <h1>Audit Trail</h1>
        <p>Append-only · tamper-evident · GxP 21 CFR Part 11 compliant · {entries.length} entries</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select className="fi2" value={filterEntityType} onChange={e => setFilterEntityType(e.target.value)}>
          <option value="">All Entities</option>
          <option value="software_catalog">Software Catalog</option>
          <option value="entitlement">Entitlement</option>
          <option value="reconciliation_run">Reconciliation</option>
        </select>
        <select className="fi2" value={filterActionType} onChange={e => setFilterActionType(e.target.value)}>
          <option value="">All Actions</option>
          <option value="CATALOG_CREATED">Catalog Created</option>
          <option value="CATALOG_UPDATED">Catalog Updated</option>
          <option value="ENTITLEMENT_UPDATED">Entitlement Updated</option>
          <option value="SOFTWARE_ONBOARDED">Software Onboarded</option>
          <option value="RECONCILIATION_RUN">Reconciliation Run</option>
        </select>
        <input
          className="fi2" style={{ width: 110 }}
          value={filterSwId}
          onChange={e => setFilterSwId(e.target.value)}
          placeholder="SW_ID filter"
        />
        <div style={{ flex: 1 }} />
        <button className="btn btn-o btn-sm" onClick={handleExport} disabled={exporting}>
          {exporting ? "Exporting…" : "⬇ Export XLSX"}
        </button>
      </div>

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Timestamp (UTC)</th><th>Action</th><th>Entity</th>
              <th>Entity ID</th><th>SW_ID</th><th>GxP</th><th>Reason</th><th>Details</th>
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
