import { useState, useEffect, useCallback, useRef } from "react";
import { fetchEntitlements, updateEntitlement, downloadTemplate, uploadUsage } from "../../api/entitlements";

const STATUS_BADGE = {
  ACTIVE:         <span className="tag tg2">Active</span>,
  OK:             <span className="tag tg2">OK</span>,
  EXPIRED:        <span className="tag tgr2">Expired</span>,
  WATCH:          <span className="tag tg4">Watch</span>,
  OVER_DEPLOYED:  <span className="tag tgr2">Over-Deployed</span>,
  UNDER_UTILISED: <span className="tag tg3">Under-Utilised</span>,
};

const TYPE_BADGE = {
  subscription: <span className="tag tg1">Sub</span>,
  perpetual:    <span className="tag tb3">Perp</span>,
};

function utilPct(entitled, inUse) {
  if (!entitled || entitled === 0) return null;
  return Math.round(((inUse || 0) / entitled) * 100);
}

export default function EntitlementsPage() {
  const [entitlements, setEntitlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [selected, setSelected] = useState(null);
  const [editInUse, setEditInUse] = useState("");
  const [saving, setSaving] = useState(false);
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

  const handleSaveInUse = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateEntitlement(selected.ent_id, { in_use_count: parseInt(editInUse) || 0 });
      reload();
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> Entitlements</div>
        <h1>Entitlement Register</h1>
        <p>{entitlements.length} entitlement records · license counts and cost tracking</p>
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select className="fi2" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="OK">OK</option>
          <option value="WATCH">Watch</option>
          <option value="OVER_DEPLOYED">Over-Deployed</option>
          <option value="UNDER_UTILISED">Under-Utilised</option>
          <option value="EXPIRED">Expired</option>
        </select>
        <select className="fi2" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          <option value="subscription">Subscription</option>
          <option value="perpetual">Perpetual</option>
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn btn-o btn-sm" onClick={handleDownloadTemplate}>⬇ Download Template</button>
        <label className="btn btn-p btn-sm" style={{ cursor: "pointer" }}>
          {uploading ? "Uploading…" : "⬆ Upload Usage (XLSX)"}
          <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {/* Upload result banner */}
      {uploadResult && (
        <div style={{
          background: uploadResult.error ? "#fff0f0" : "var(--navy-xlt)",
          border: "1px solid var(--bdr)", borderRadius: 6, padding: "8px 12px",
          marginBottom: 12, fontSize: 12,
        }}>
          {uploadResult.error ? (
            <span style={{ color: "var(--red)" }}>{uploadResult.error}</span>
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

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>ENT_ID</th><th>SW_ID</th><th>Contract Name</th><th>Type</th>
              <th>Entitled</th><th>In Use</th><th>Util %</th><th>Annual Cost (INR)</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="9" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {entitlements.map(ent => {
              const pct = utilPct(ent.entitled_count, ent.in_use_count);
              return (
                <tr
                  key={ent.ent_id}
                  style={{ cursor: "pointer", background: selected?.ent_id === ent.ent_id ? "var(--navy-xlt)" : undefined }}
                  onClick={() => {
                    setSelected(selected?.ent_id === ent.ent_id ? null : ent);
                    setEditInUse(String(ent.in_use_count ?? ""));
                  }}
                >
                  <td><code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{ent.ent_id}</code></td>
                  <td style={{ fontSize: 11.5 }}>{ent.sw_id}</td>
                  <td style={{ fontSize: 12 }}>{ent.contract_name || "—"}</td>
                  <td>{TYPE_BADGE[ent.license_type] ?? ent.license_type}</td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>{ent.entitled_count?.toLocaleString() ?? "—"}</td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>{ent.in_use_count?.toLocaleString() ?? "—"}</td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>
                    {pct !== null ? (
                      <span style={{ color: pct > 100 ? "var(--red)" : pct > 90 ? "var(--amber-m)" : "inherit" }}>
                        {pct}%
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>
                    {ent.annual_cost_inr ? `₹${ent.annual_cost_inr.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td>{STATUS_BADGE[ent.status] ?? ent.status}</td>
                </tr>
              );
            })}
            {!loading && entitlements.length === 0 && (
              <tr><td colSpan="9" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>No entitlements yet. Add software via the Onboard page first.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selected && (
        <div style={{ marginTop: 16, background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 16, maxWidth: 480 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <strong>{selected.ent_id}</strong>
            <button className="btn btn-o btn-sm" onClick={() => setSelected(null)}>✕</button>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.8, marginBottom: 12 }}>
            <div><strong>SW_ID:</strong> {selected.sw_id}</div>
            <div><strong>Contract:</strong> {selected.contract_name || "—"}</div>
            <div><strong>License Type:</strong> {selected.license_type}</div>
            <div><strong>Entitled:</strong> {selected.entitled_count?.toLocaleString() ?? "—"}</div>
            <div><strong>Annual Cost:</strong> {selected.annual_cost_inr ? `₹${selected.annual_cost_inr.toLocaleString("en-IN")}` : "—"}</div>
            <div><strong>Status:</strong> {selected.status}</div>
          </div>
          <div className="fg">
            <label className="fl">Update In-Use Count</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input className="fi2" style={{ maxWidth: 120 }} type="number" value={editInUse} onChange={e => setEditInUse(e.target.value)} />
              <button className="btn btn-p btn-sm" onClick={handleSaveInUse} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
