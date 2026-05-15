import { useState, useEffect, useCallback, useRef } from "react";
import { fetchDiscovery, ingestDiscovery } from "../../api/discovery";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_BADGE = {
  endpoint: <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: "var(--blue-l)", color: "var(--blue-m)" }}>Endpoint</span>,
  server:   <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: "var(--purple-l)", color: "var(--purple-m)" }}>Server</span>,
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function DiscoveryPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ingestResult, setIngestResult] = useState(null);
  const [ingesting, setIngesting] = useState(false);
  const fileInputRef = useRef(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await fetchDiscovery());
    } finally {
      setLoading(false);
    }
  }, []);

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

  // Client-side search: disc_id, contract_name, canonical_name, device_id
  const displayRows = search
    ? records.filter(r => {
        const q = search.toLowerCase();
        return (
          (r.disc_id || "").toLowerCase().includes(q) ||
          (r.contract_name || "").toLowerCase().includes(q) ||
          (r.canonical_name || "").toLowerCase().includes(q) ||
          (r.sw_id || "").toLowerCase().includes(q) ||
          (r.device_id || "").toLowerCase().includes(q)
        );
      })
    : records;


  const COLS = [
    { key: "disc_id",           label: "DISC_ID",                w: 80  },
    { key: "contract_name",     label: "Contract Software Name", w: 180 },
    { key: "sw_id",             label: "SW_ID",                  w: 80  },
    { key: "canonical_name",    label: "Software Name",          w: 160 },
    { key: "application_tagged",label: "Application Tagged",     w: 160 },
    { key: "source_name",       label: "Data Source",            w: 120 },
    { key: "device_type",       label: "Type",                   w: 90  },
    { key: "device_id",         label: "Device ID",              w: 120 },
    { key: "os",                label: "OS",                     w: 100 },
    { key: "version",           label: "Version",                w: 90  },
    { key: "last_seen",         label: "Last Updated",           w: 110 },
    { key: "region_name",       label: "Region",                 w: 100 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)",
      overflow: "hidden", padding: "18px 22px 0" }}>

      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "var(--tx-q)", marginBottom: 4 }}>
          SAM Platform <span style={{ color: "var(--tx-m)" }}>›</span> License Discovery
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 2 }}>License Discovery</h1>
        <p style={{ fontSize: 12.5, color: "var(--tx-m)" }}>
          {displayRows.length} discovery records · device-level software usage data
        </p>
      </div>

      {/* Template guidance banner */}
      <div style={{
        flexShrink: 0, marginBottom: 12,
        display: "flex", alignItems: "center", gap: 14,
        background: "#EFF6FF", border: "1.5px dashed #93C5FD", borderRadius: 8,
        padding: "10px 16px",
      }}>
        <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 6,
          background: "#DBEAFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
          📄
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#1E40AF", marginBottom: 2 }}>
            Upload via Tab B of the Entitlement Template
            <span style={{ fontWeight: 400, color: "#3B82F6", marginLeft: 8 }}>
              — or upload a CSV / XLSX directly below
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#3B82F6" }}>
            Expected columns: Contract Software Name · SW_ID · Application Tagged · Data Source · Device Type · Device ID · OS · Version · Last Seen (YYYY-MM-DD) · Region
          </div>
        </div>
      </div>

      {/* Filter + action bar */}
      <div style={{ flexShrink: 0, display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
        <input
          className="fi2" style={{ flex: "1 1 200px", minWidth: 160 }}
          placeholder="Search DISC_ID, software name, device ID…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <label className="btn btn-p btn-sm" style={{ flex: "0 0 auto", cursor: "pointer", whiteSpace: "nowrap" }}>
          {ingesting ? "Ingesting…" : "⬆ Upload CSV / XLSX"}
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }}
            onChange={handleIngest} disabled={ingesting} />
        </label>
      </div>

      {/* Ingest result banner */}
      {ingestResult && (
        <div style={{
          flexShrink: 0,
          background: ingestResult.error ? "#fff0f0" : "var(--navy-xlt)",
          border: "1px solid var(--bdr)", borderRadius: 6, padding: "8px 12px",
          marginBottom: 10, fontSize: 12,
        }}>
          {ingestResult.error ? (
            <span style={{ color: "var(--red-m)" }}>{ingestResult.error}</span>
          ) : (
            <>
              <strong>Ingest complete</strong> — {ingestResult.inserted} records inserted
              {ingestResult.errors?.length > 0 && (
                <div style={{ color: "var(--amber-m)", marginTop: 4 }}>{ingestResult.errors.join("; ")}</div>
              )}
            </>
          )}
          <button style={{ float: "right", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}
            onClick={() => setIngestResult(null)}>✕</button>
        </div>
      )}

      {/* Table — fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", borderRadius: 8,
        border: "1px solid var(--bdr)", marginBottom: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1300 }}>
          <thead>
            <tr style={{ background: "var(--surf)" }}>
              {COLS.map(col => (
                <th key={col.key} style={{
                  position: "sticky", top: 0, zIndex: 2,
                  background: "var(--surf)", borderBottom: "2px solid var(--bdr)",
                  padding: "8px 12px", fontSize: 10, fontWeight: 700,
                  color: "var(--tx-q)", textTransform: "uppercase", letterSpacing: 0.5,
                  whiteSpace: "nowrap", textAlign: "left",
                  minWidth: col.w, width: col.w,
                }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={COLS.length} style={{ textAlign: "center", padding: 24, color: "var(--tx-q)" }}>Loading…</td></tr>
            )}
            {!loading && displayRows.length === 0 && (
              <tr><td colSpan={COLS.length} style={{ textAlign: "center", padding: 24, color: "var(--tx-q)" }}>
                No discovery records. Upload a CSV / XLSX or use Tab B of the Entitlement Template.
              </td></tr>
            )}
            {displayRows.map(rec => (
              <tr key={rec.disc_id} style={{ borderBottom: "1px solid var(--bdr)" }}>
                {/* DISC_ID */}
                <td style={{ padding: "9px 12px" }}>
                  <code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{rec.disc_id}</code>
                </td>
                {/* Contract Software Name */}
                <td style={{ padding: "9px 12px", fontSize: 12, fontWeight: 500 }}>{rec.contract_name || "—"}</td>
                {/* SW_ID */}
                <td style={{ padding: "9px 12px" }}>
                  {rec.sw_id
                    ? <code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{rec.sw_id}</code>
                    : <span style={{ color: "var(--tx-q)", fontSize: 11 }}>—</span>}
                </td>
                {/* Canonical name */}
                <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--tx-m)", whiteSpace: "nowrap" }}>
                  {rec.canonical_name || "—"}
                </td>
                {/* Application Tagged */}
                <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--tx-m)" }}>
                  {rec.application_tagged || "—"}
                </td>
                {/* Data Source */}
                <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--tx-m)", whiteSpace: "nowrap" }}>
                  {rec.source_name || "—"}
                </td>
                {/* Type */}
                <td style={{ padding: "9px 12px" }}>
                  {TYPE_BADGE[rec.device_type] ?? (rec.device_type || "—")}
                </td>
                {/* Device ID */}
                <td style={{ padding: "9px 12px", fontSize: 11.5, color: "var(--tx-m)" }}>
                  {rec.device_id || "—"}
                </td>
                {/* OS */}
                <td style={{ padding: "9px 12px", fontSize: 11.5 }}>{rec.os || "—"}</td>
                {/* Version */}
                <td style={{ padding: "9px 12px", fontSize: 11.5, color: "var(--tx-m)" }}>{rec.version || "—"}</td>
                {/* Last Updated */}
                <td style={{ padding: "9px 12px", fontSize: 11.5, color: "var(--tx-m)", whiteSpace: "nowrap" }}>
                  {fmtDate(rec.last_seen)}
                </td>
                {/* Region */}
                <td style={{ padding: "9px 12px", fontSize: 11.5, color: "var(--tx-m)" }}>
                  {rec.region_name || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
