import { useState, useEffect, useCallback, useRef } from "react";
import { fetchEntitlements, updateEntitlement, downloadTemplate, uploadUsage } from "../../api/entitlements";

// ── Badges ────────────────────────────────────────────────────────────────────
const STATUS_STYLE = {
  ACTIVE:         { bg: "var(--green-l)",  color: "var(--green-m)",  label: "Active" },
  OK:             { bg: "var(--green-l)",  color: "var(--green-m)",  label: "OK" },
  WATCH:          { bg: "var(--amber-l)", color: "var(--amber-m)", label: "Watch" },
  OVER_DEPLOYED:  { bg: "#fff0f0",         color: "var(--red-m)",   label: "Over-Deployed" },
  UNDER_UTILISED: { bg: "var(--blue-l)",   color: "var(--teal-m)",  label: "Under-Utilised" },
  EXPIRED:        { bg: "var(--bdr)",      color: "var(--tx-m)",    label: "Expired" },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status];
  if (!s) return <span style={{ fontSize: 11, color: "var(--tx-q)" }}>{status}</span>;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 3, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

const TYPE_BADGE = {
  subscription: <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: "var(--blue-l)", color: "var(--blue-m)" }}>Sub</span>,
  perpetual:    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: "var(--purple-l)", color: "var(--purple-m)" }}>Perp</span>,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtINR(n) {
  if (!n) return "—";
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(0)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function utilPct(entitled, inUse) {
  if (!entitled || entitled === 0) return null;
  return Math.round(((inUse || 0) / entitled) * 100);
}

function InfoCell({ label, value }) {
  return (
    <div style={{ background: "var(--surf)", borderRadius: 6, padding: "10px 14px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx-q)", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{value ?? "—"}</div>
    </div>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────
function DetailDrawer({ ent, onClose, onSave }) {
  const [editInUse, setEditInUse] = useState(String(ent.in_use_count ?? ""));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditInUse(String(ent.in_use_count ?? ""));
  }, [ent.ent_id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateEntitlement(ent.ent_id, { in_use_count: parseInt(editInUse) || 0 });
      onSave();
    } finally {
      setSaving(false);
    }
  };

  const pct = utilPct(ent.entitled_count, ent.in_use_count);
  const idle = (ent.entitled_count != null && ent.in_use_count != null)
    ? Math.max(0, ent.entitled_count - ent.in_use_count)
    : null;

  return (
    <div style={{
      width: 420, flexShrink: 0, borderLeft: "1px solid var(--bdr)",
      background: "var(--card)", display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--bdr)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>{ent.contract_name || ent.ent_id}</strong>
        <button className="btn btn-o btn-sm" onClick={onClose}>✕ Close</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>

        {/* Tags row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          <StatusBadge status={ent.status} />
          {TYPE_BADGE[ent.license_type] ?? null}
        </div>

        {/* Identity */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          <InfoCell label="ENT_ID" value={<code style={{ fontSize: 12 }}>{ent.ent_id}</code>} />
          <InfoCell label="SW_ID" value={<code style={{ fontSize: 12 }}>{ent.sw_id}</code>} />
          <InfoCell label="UTIL %" value={pct != null ? (
            <span style={{ color: pct > 100 ? "var(--red-m)" : pct > 90 ? "var(--amber-m)" : "var(--green-m)", fontWeight: 700 }}>{pct}%</span>
          ) : undefined} />
        </div>

        {/* Counts */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          <InfoCell label="ENTITLED" value={ent.entitled_count?.toLocaleString()} />
          <InfoCell label="IN-USE" value={ent.in_use_count?.toLocaleString()} />
          <InfoCell label="IDLE" value={idle?.toLocaleString()} />
        </div>

        {/* Cost */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <InfoCell label="UNIT COST" value={fmtINR(ent.unit_cost_inr)} />
          <InfoCell label="ANNUAL COST" value={fmtINR(ent.annual_cost_inr)} />
        </div>

        {/* Update In-Use */}
        <div style={{ background: "var(--surf)", borderRadius: 6, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx-q)", letterSpacing: 0.5, marginBottom: 8 }}>UPDATE IN-USE COUNT</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input className="fi2" style={{ flex: 1 }} type="number" min="0" value={editInUse} onChange={e => setEditInUse(e.target.value)} />
            <button className="btn btn-p btn-sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EntitlementsPage() {
  const [entitlements, setEntitlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [selected, setSelected] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.license_type = filterType;
      const data = await fetchEntitlements(params);
      setEntitlements(data);
      if (selected) {
        const refreshed = data.find(e => e.ent_id === selected.ent_id);
        setSelected(refreshed || null);
      }
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload(); }, [reload]);

  const handleDownloadTemplate = async () => {
    const blob = await downloadTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `entitlements_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const result = await uploadUsage(file);
      setUploadResult(result);
      reload();
    } catch (err) {
      setUploadResult({ error: err?.response?.data?.detail || "Upload failed" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Client-side search across ENT_ID, SW_ID, Contract Name
  const displayRows = search
    ? entitlements.filter(e => {
        const q = search.toLowerCase();
        return (
          e.ent_id.toLowerCase().includes(q) ||
          e.sw_id.toLowerCase().includes(q) ||
          (e.contract_name || "").toLowerCase().includes(q)
        );
      })
    : entitlements;

  const COLS = ["ENT_ID", "SW_ID", "Contract Name", "Type", "Entitled", "In-Use", "Util %", "Annual Cost (INR)", "Status"];
  const RIGHT_ALIGN = new Set(["Entitled", "In-Use", "Util %", "Annual Cost (INR)"]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)", overflow: "hidden", padding: "18px 22px 0" }}>

      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "var(--tx-q)", marginBottom: 4 }}>
          SAM Platform <span style={{ color: "var(--tx-m)" }}>›</span> Entitlements
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 2 }}>Entitlement Register</h1>
        <p style={{ fontSize: 12.5, color: "var(--tx-m)" }}>
          {displayRows.length} entitlement records · license counts and cost tracking
        </p>
      </div>

      {/* Filter + action bar — single line, no wrap */}
      <div style={{ flexShrink: 0, display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
        <input
          className="fi2" style={{ flex: "1 1 200px", minWidth: 160 }}
          placeholder="Search ENT_ID, SW_ID, contract name…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <select className="fi2" style={{ flex: "0 0 150px" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="OK">OK</option>
          <option value="WATCH">Watch</option>
          <option value="OVER_DEPLOYED">Over-Deployed</option>
          <option value="UNDER_UTILISED">Under-Utilised</option>
          <option value="EXPIRED">Expired</option>
        </select>
        <select className="fi2" style={{ flex: "0 0 120px" }} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          <option value="subscription">Subscription</option>
          <option value="perpetual">Perpetual</option>
        </select>
        <button className="btn btn-o btn-sm" style={{ flex: "0 0 auto", whiteSpace: "nowrap" }} onClick={handleDownloadTemplate}>
          ⬇ Download Template
        </button>
        <label className="btn btn-p btn-sm" style={{ flex: "0 0 auto", cursor: "pointer", whiteSpace: "nowrap" }}>
          {uploading ? "Uploading…" : "⬆ Upload Usage"}
          <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {/* Upload result banner */}
      {uploadResult && (
        <div style={{
          flexShrink: 0,
          background: uploadResult.error ? "#fff0f0" : "var(--navy-xlt)",
          border: "1px solid var(--bdr)", borderRadius: 6, padding: "8px 12px",
          marginBottom: 10, fontSize: 12,
        }}>
          {uploadResult.error ? (
            <span style={{ color: "var(--red-m)" }}>{uploadResult.error}</span>
          ) : (
            <>
              <strong>Upload complete</strong> — Tab A: {uploadResult.tab_a_updated} rows · Tab B: {uploadResult.tab_b_updated} rows updated
              {uploadResult.errors?.length > 0 && (
                <div style={{ color: "var(--amber-m)", marginTop: 4 }}>{uploadResult.errors.join("; ")}</div>
              )}
            </>
          )}
          <button style={{ float: "right", background: "none", border: "none", cursor: "pointer", fontSize: 12 }} onClick={() => setUploadResult(null)}>✕</button>
        </div>
      )}

      {/* Table + Drawer — fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden", borderRadius: 8, border: "1px solid var(--bdr)", marginBottom: 12 }}>

        {/* Scrollable table */}
        <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
            <thead>
              <tr style={{ background: "var(--surf)" }}>
                {COLS.map(col => (
                  <th key={col} style={{
                    position: "sticky", top: 0, zIndex: 2,
                    background: "var(--surf)", borderBottom: "2px solid var(--bdr)",
                    padding: "8px 12px", fontSize: 10, fontWeight: 700,
                    color: "var(--tx-q)", textTransform: "uppercase", letterSpacing: 0.5,
                    whiteSpace: "nowrap", textAlign: RIGHT_ALIGN.has(col) ? "right" : "left",
                  }}>
                    {col}
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
                  No entitlements found. Add software via the Onboard page first.
                </td></tr>
              )}
              {displayRows.map(ent => {
                const pct = utilPct(ent.entitled_count, ent.in_use_count);
                const isSelected = selected?.ent_id === ent.ent_id;
                return (
                  <tr
                    key={ent.ent_id}
                    style={{ cursor: "pointer", borderBottom: "1px solid var(--bdr)", background: isSelected ? "var(--navy-xlt)" : undefined }}
                    onClick={() => setSelected(isSelected ? null : ent)}
                  >
                    <td style={{ padding: "9px 12px" }}>
                      <code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{ent.ent_id}</code>
                    </td>
                    <td style={{ padding: "9px 12px", fontSize: 11.5, color: "var(--tx-m)" }}>{ent.sw_id}</td>
                    <td style={{ padding: "9px 12px", fontSize: 12, fontWeight: 500 }}>{ent.contract_name || "—"}</td>
                    <td style={{ padding: "9px 12px" }}>{TYPE_BADGE[ent.license_type] ?? ent.license_type}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12 }}>{ent.entitled_count?.toLocaleString() ?? "—"}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12 }}>{ent.in_use_count?.toLocaleString() ?? "—"}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12 }}>
                      {pct !== null ? (
                        <span style={{ color: pct > 100 ? "var(--red-m)" : pct > 90 ? "var(--amber-m)" : "var(--tx-m)", fontWeight: pct > 90 ? 700 : 400 }}>
                          {pct}%
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12 }}>
                      {ent.annual_cost_inr ? `₹${ent.annual_cost_inr.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td style={{ padding: "9px 12px" }}><StatusBadge status={ent.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Detail drawer — opens inline to the right */}
        {selected && (
          <DetailDrawer
            ent={selected}
            onClose={() => setSelected(null)}
            onSave={reload}
          />
        )}
      </div>
    </div>
  );
}
