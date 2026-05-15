import { useState, useEffect, useCallback, useRef } from "react";
import { fetchEntitlements, updateEntitlement, downloadTemplate, uploadUsage, renewEntitlement } from "../../api/entitlements";

// ── Badges ────────────────────────────────────────────────────────────────────
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
  if (!s) return <span style={{ fontSize: 11, color: "var(--tx-q)" }}>{status}</span>;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 3,
      background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

const TYPE_BADGE = {
  subscription: <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: "var(--blue-l)", color: "var(--blue-m)" }}>Subscription</span>,
  perpetual:    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: "var(--purple-l)", color: "var(--purple-m)" }}>Perpetual</span>,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtINR(n) {
  if (!n) return "—";
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(0)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function utilPct(entitled, inUse) {
  if (!entitled || entitled === 0) return null;
  return Math.round(((inUse || 0) / entitled) * 100);
}

function InfoCell({ label, value, span2 }) {
  return (
    <div style={{ background: "var(--surf)", borderRadius: 6, padding: "10px 14px", gridColumn: span2 ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx-q)", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{value ?? "—"}</div>
    </div>
  );
}

function Avatar({ initials, name }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--navy-mid)", color: "#fff",
        fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {initials || "?"}
      </div>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{name || "—"}</span>
    </div>
  );
}

// ── Renew Modal ───────────────────────────────────────────────────────────────
function RenewModal({ ent, onClose, onRenewed }) {
  const blank = { contract_name: "", po_number: "", clm_id: "", start_date: "", end_date: "",
    entitled_count: ent.entitled_count ?? "", unit_cost_inr: ent.unit_cost_inr ?? "",
    annual_cost_inr: ent.annual_cost_inr ?? "", notes: "" };
  const [form, setForm] = useState(blank);
  const [contractFile, setContractFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.contract_name.trim()) { setError("Contract Name is required."); return; }
    setSubmitting(true); setError(null);
    try {
      const fields = {
        contract_name:  form.contract_name.trim(),
        po_number:      form.po_number || null,
        clm_id:         form.clm_id || null,
        start_date:     form.start_date || null,
        end_date:       form.end_date || null,
        entitled_count: form.entitled_count ? parseInt(form.entitled_count) : null,
        unit_cost_inr:  form.unit_cost_inr ? parseInt(form.unit_cost_inr) : null,
        annual_cost_inr: form.annual_cost_inr ? parseInt(form.annual_cost_inr) : null,
        notes:          form.notes || null,
      };
      const res = await renewEntitlement(ent.ent_id, fields, contractFile);
      setResult(res);
      onRenewed();
    } catch (e) {
      setError(e?.response?.data?.detail || "Renewal failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "var(--card)", borderRadius: 10, width: 520, maxHeight: "90vh",
        overflow: "auto", padding: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Renew Contract</div>
            <div style={{ fontSize: 12, color: "var(--tx-q)", marginTop: 2 }}>
              {ent.canonical_name} · retiring <code style={{ fontSize: 11 }}>{ent.ent_id}</code>
            </div>
          </div>
          <button className="btn btn-o btn-sm" onClick={onClose}>✕</button>
        </div>

        {result ? (
          <div style={{ background: "var(--navy-xlt)", border: "1px solid var(--bdr)", borderRadius: 6, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--green-m)" }}>Renewal successful</div>
            <div style={{ fontSize: 13, lineHeight: 1.9 }}>
              <div>New SW ID: <code>{result.new_sw_id}</code></div>
              <div>New ENT ID: <code>{result.new_ent_id}</code></div>
              <div>Retired: <code>{result.retired_ent_id}</code> → EXPIRED</div>
              {contractFile && <div style={{ color: "var(--teal-m)" }}>Document: {contractFile.name} — uploaded</div>}
            </div>
            <button className="btn btn-p btn-sm" style={{ marginTop: 14 }} onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            {error && <div style={{ background: "#fff0f0", border: "1px solid var(--red-m)", borderRadius: 6,
              padding: "8px 12px", fontSize: 12, color: "var(--red-m)", marginBottom: 12 }}>{error}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, display: "block" }}>CONTRACT NAME *</label>
                <input className="fi2" style={{ width: "100%" }} placeholder="e.g. SAP S/4HANA Renewal FY26"
                  value={form.contract_name} onChange={e => set("contract_name", e.target.value)} />
              </div>
              <div>
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, display: "block" }}>PO NUMBER</label>
                <input className="fi2" style={{ width: "100%" }} value={form.po_number} onChange={e => set("po_number", e.target.value)} />
              </div>
              <div>
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, display: "block" }}>CLM ID</label>
                <input className="fi2" style={{ width: "100%" }} value={form.clm_id} onChange={e => set("clm_id", e.target.value)} />
              </div>
              <div>
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, display: "block" }}>START DATE</label>
                <input className="fi2" style={{ width: "100%" }} type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} />
              </div>
              <div>
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, display: "block" }}>EXPIRY DATE</label>
                <input className="fi2" style={{ width: "100%" }} type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} />
              </div>
              <div>
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, display: "block" }}>ENTITLED COUNT</label>
                <input className="fi2" style={{ width: "100%" }} type="number" min="0" value={form.entitled_count} onChange={e => set("entitled_count", e.target.value)} />
              </div>
              <div>
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, display: "block" }}>UNIT COST (INR)</label>
                <input className="fi2" style={{ width: "100%" }} type="number" min="0" value={form.unit_cost_inr} onChange={e => set("unit_cost_inr", e.target.value)} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, display: "block" }}>ANNUAL COST (INR)</label>
                <input className="fi2" style={{ width: "100%" }} type="number" min="0" value={form.annual_cost_inr} onChange={e => set("annual_cost_inr", e.target.value)} />
              </div>

              {/* Contract document upload */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, display: "block" }}>
                  CONTRACT DOCUMENT <span style={{ fontWeight: 400, color: "var(--tx-q)" }}>(PDF / DOCX — optional)</span>
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.docx,.doc"
                    style={{ display: "none" }}
                    onChange={e => setContractFile(e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    className="btn btn-o btn-sm"
                    style={{ whiteSpace: "nowrap" }}
                    onClick={() => fileRef.current?.click()}
                  >
                    Choose File
                  </button>
                  {contractFile ? (
                    <span style={{ fontSize: 12, color: "var(--teal-m)", fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {contractFile.name}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--tx-q)" }}>No file selected</span>
                  )}
                  {contractFile && (
                    <button type="button" style={{ background: "none", border: "none", color: "var(--tx-q)", cursor: "pointer", fontSize: 13 }}
                      onClick={() => { setContractFile(null); if (fileRef.current) fileRef.current.value = ""; }}>✕</button>
                  )}
                </div>
              </div>
            </div>

            <div style={{ background: "var(--amber-l)", border: "1px solid var(--amber-m)", borderRadius: 6,
              padding: "8px 12px", fontSize: 11.5, color: "var(--amber-m)", marginBottom: 16 }}>
              This will create a new SW_ID and ENT_ID. The current record
              (<code style={{ fontSize: 11 }}>{ent.ent_id}</code>) will be marked <strong>EXPIRED</strong> and
              preserved in the register for history.
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-o btn-sm" onClick={onClose}>Cancel</button>
              <button className="btn btn-p btn-sm" style={{ background: "var(--navy-mid)" }}
                onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Renewing…" : "Confirm Renewal"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────
function DetailDrawer({ ent, onClose, onSave }) {
  const [editInUse, setEditInUse] = useState(String(ent.in_use_count ?? ""));
  const [saving, setSaving] = useState(false);
  const [showRenew, setShowRenew] = useState(false);

  useEffect(() => {
    setEditInUse(String(ent.in_use_count ?? ""));
    setShowRenew(false);
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

  return (
    <>
    {showRenew && (
      <RenewModal ent={ent} onClose={() => setShowRenew(false)} onRenewed={() => { setShowRenew(false); onSave(); onClose(); }} />
    )}
    <div style={{
      width: 440, flexShrink: 0, borderLeft: "1px solid var(--bdr)",
      background: "var(--card)", display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--bdr)",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{ent.contract_name || ent.ent_id}</div>
          <div style={{ fontSize: 11, color: "var(--tx-q)", marginTop: 2 }}>{ent.sw_id} · {ent.ent_id}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {ent.status !== "EXPIRED" && (
            <button className="btn btn-o btn-sm" style={{ color: "var(--teal-m)", borderColor: "var(--teal-m)" }}
              onClick={() => setShowRenew(true)}>↻ Renew</button>
          )}
          <button className="btn btn-o btn-sm" onClick={onClose}>✕ Close</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>

        {/* Status + type tags */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          <StatusBadge status={ent.status} />
          {TYPE_BADGE[ent.license_type] ?? null}
        </div>

        {/* ── License section ─────────────────────────────────────────── */}
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx-q)", letterSpacing: 0.8,
          textTransform: "uppercase", marginBottom: 8 }}>License Details</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          <InfoCell label="PUBLISHER" value={ent.publisher} />
          <InfoCell label="METRIC" value={ent.metric_name} />
          <InfoCell label="UNIT COST" value={fmtINR(ent.unit_cost_inr)} />
          <InfoCell label="ANNUAL COST" value={fmtINR(ent.annual_cost_inr)} />
        </div>

        {/* ── Contract section ─────────────────────────────────────────── */}
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx-q)", letterSpacing: 0.8,
          textTransform: "uppercase", marginBottom: 8 }}>Contract</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          <InfoCell label="PO NUMBER" value={ent.po_number} />
          <InfoCell label="CLM ID" value={ent.clm_id} />
          <InfoCell label="START DATE" value={fmtDate(ent.start_date)} />
          <InfoCell label="EXPIRY DATE" value={fmtDate(ent.end_date)} />
          <InfoCell label="VENDOR / RESELLER" value={ent.vendor_reseller} span2 />
        </div>

        {/* ── Discovery section ────────────────────────────────────────── */}
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx-q)", letterSpacing: 0.8,
          textTransform: "uppercase", marginBottom: 8 }}>Discovery & Source</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          <InfoCell label="DISCOVERY SOURCE" value={ent.discovery_source_name} />
          <InfoCell label="SOURCE MGMT" value={ent.usage_method_name} />
        </div>

        {/* ── App Owner ────────────────────────────────────────────────── */}
        {(ent.app_owner_name) && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx-q)", letterSpacing: 0.8,
              textTransform: "uppercase", marginBottom: 8 }}>App Owner</div>
            <div style={{ background: "var(--surf)", borderRadius: 6, padding: "10px 14px", marginBottom: 16 }}>
              <Avatar initials={ent.app_owner_initials} name={ent.app_owner_name} />
            </div>
          </>
        )}

        {/* ── Update In-Use ────────────────────────────────────────────── */}
        <div style={{ background: "var(--surf)", borderRadius: 6, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx-q)", letterSpacing: 0.5, marginBottom: 8 }}>
            UPDATE IN-USE COUNT
          </div>
          <div style={{ fontSize: 12, color: "var(--tx-m)", marginBottom: 8 }}>
            Current: <strong>{ent.in_use_count?.toLocaleString() ?? "—"}</strong> of{" "}
            <strong>{ent.entitled_count?.toLocaleString() ?? "—"}</strong> entitled
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input className="fi2" style={{ flex: 1 }} type="number" min="0"
              value={editInUse} onChange={e => setEditInUse(e.target.value)} />
            <button className="btn btn-p btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
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
    a.download = "DRL_LicenseUsage_Template_v3.xlsx";
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

  // Client-side search: ENT_ID, SW_ID, software name, contract name
  const displayRows = search
    ? entitlements.filter(e => {
        const q = search.toLowerCase();
        return (
          e.ent_id.toLowerCase().includes(q) ||
          e.sw_id.toLowerCase().includes(q) ||
          (e.canonical_name || "").toLowerCase().includes(q) ||
          (e.contract_name || "").toLowerCase().includes(q)
        );
      })
    : entitlements;

  // Table columns
  const COLS = [
    { key: "ent_id",         label: "ENT_ID",                  w: 90  },
    { key: "sw_id",          label: "SW_ID",                   w: 80  },
    { key: "contract_name",  label: "Contract Software Name",  w: 180 },
    { key: "canonical_name", label: "Software Name",           w: 160 },
    { key: "entitled_count", label: "Entitled",                w: 80,  right: true },
    { key: "in_use_count",   label: "In-Use",                  w: 80,  right: true },
    { key: "util_pct",       label: "Util %",                  w: 70,  right: true },
    { key: "annual_cost_inr",label: "Annual Cost (INR)",       w: 130, right: true },
    { key: "last_updated",   label: "Last Updated",            w: 110 },
    { key: "status",         label: "Status",                  w: 130 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)",
      overflow: "hidden", padding: "18px 22px 0" }}>

      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "var(--tx-q)", marginBottom: 4 }}>
          SAM Platform <span style={{ color: "var(--tx-m)" }}>›</span> Entitlements
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 2 }}>Entitlement Register</h1>
        <p style={{ fontSize: 12.5, color: "var(--tx-m)" }}>
          {displayRows.length} entitlement records · click any row to view full details
        </p>
      </div>

      {/* ── Template guidance banner ─────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, marginBottom: 12,
        display: "flex", alignItems: "center", gap: 14,
        background: "#EFF6FF", border: "1.5px dashed #93C5FD", borderRadius: 8,
        padding: "12px 16px",
      }}>
        {/* File icon */}
        <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 6,
          background: "#DBEAFE", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18 }}>
          📄
        </div>
        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1E40AF", marginBottom: 3 }}>
            Template: DRL_LicenseUsage_Template_v3.xlsx
            <span style={{ fontWeight: 400, color: "#3B82F6", marginLeft: 8 }}>
              — Tab A: Entitlement Update · Tab B: License Discovery
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: "#3B82F6" }}>
            Download → fill both tabs → upload. Platform auto-reconciles.
            Previous upload moved to S3 Archive.
            <span style={{ marginLeft: 8, color: "#93C5FD" }}>Supports: XLSX · XLS · Max 25MB</span>
          </div>
        </div>
        {/* Download button */}
        <button
          style={{
            flexShrink: 0, background: "var(--navy-mid)", color: "#fff",
            border: "none", borderRadius: 6, padding: "8px 18px",
            fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
          }}
          onClick={handleDownloadTemplate}
        >
          ↓ Download
        </button>
      </div>

      {/* Filter + action bar */}
      <div style={{ flexShrink: 0, display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
        <input
          className="fi2" style={{ flex: "1 1 200px", minWidth: 160 }}
          placeholder="Search ENT_ID, SW_ID, software name, contract…"
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
        <label className="btn btn-p btn-sm" style={{ flex: "0 0 auto", cursor: "pointer", whiteSpace: "nowrap" }}>
          {uploading ? "Uploading…" : "⬆ Upload Usage"}
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
            onChange={handleUpload} disabled={uploading} />
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
          <button style={{ float: "right", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}
            onClick={() => setUploadResult(null)}>✕</button>
        </div>
      )}

      {/* Table + Drawer */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden",
        borderRadius: 8, border: "1px solid var(--bdr)", marginBottom: 12 }}>

        {/* Scrollable table */}
        <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
            <thead>
              <tr style={{ background: "var(--surf)" }}>
                {COLS.map(col => (
                  <th key={col.key} style={{
                    position: "sticky", top: 0, zIndex: 2,
                    background: "var(--surf)", borderBottom: "2px solid var(--bdr)",
                    padding: "8px 12px", fontSize: 10, fontWeight: 700,
                    color: "var(--tx-q)", textTransform: "uppercase", letterSpacing: 0.5,
                    whiteSpace: "nowrap", textAlign: col.right ? "right" : "left",
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
                  No entitlements found. Add software via the Onboard page first.
                </td></tr>
              )}
              {displayRows.map(ent => {
                const pct = utilPct(ent.entitled_count, ent.in_use_count);
                const isSelected = selected?.ent_id === ent.ent_id;
                return (
                  <tr key={ent.ent_id}
                    style={{ cursor: "pointer", borderBottom: "1px solid var(--bdr)",
                      background: isSelected ? "var(--navy-xlt)" : undefined }}
                    onClick={() => setSelected(isSelected ? null : ent)}
                  >
                    {/* ENT_ID */}
                    <td style={{ padding: "9px 12px" }}>
                      <code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{ent.ent_id}</code>
                    </td>
                    {/* SW_ID */}
                    <td style={{ padding: "9px 12px" }}>
                      <code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{ent.sw_id}</code>
                    </td>
                    {/* Contract Software Name */}
                    <td style={{ padding: "9px 12px", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>
                      {ent.contract_name || "—"}
                    </td>
                    {/* Software Name (canonical) */}
                    <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--tx-m)", whiteSpace: "nowrap" }}>
                      {ent.canonical_name || "—"}
                    </td>
                    {/* Entitled */}
                    <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12 }}>
                      {ent.entitled_count?.toLocaleString() ?? "—"}
                    </td>
                    {/* In-Use */}
                    <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12 }}>
                      {ent.in_use_count?.toLocaleString() ?? "—"}
                    </td>
                    {/* Util % */}
                    <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12 }}>
                      {pct !== null ? (
                        <span style={{ color: pct > 100 ? "var(--red-m)" : pct > 90 ? "var(--amber-m)" : "var(--tx-m)",
                          fontWeight: pct > 90 ? 700 : 400 }}>
                          {pct}%
                        </span>
                      ) : "—"}
                    </td>
                    {/* Annual Cost */}
                    <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12 }}>
                      {ent.annual_cost_inr ? `₹${ent.annual_cost_inr.toLocaleString("en-IN")}` : "—"}
                    </td>
                    {/* Last Updated */}
                    <td style={{ padding: "9px 12px", fontSize: 11, color: "var(--tx-m)", whiteSpace: "nowrap" }}>
                      {fmtDateTime(ent.last_updated)}
                    </td>
                    {/* Status */}
                    <td style={{ padding: "9px 12px" }}>
                      <StatusBadge status={ent.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Detail drawer */}
        {selected && (
          <DetailDrawer ent={selected} onClose={() => setSelected(null)} onSave={reload} />
        )}
      </div>
    </div>
  );
}
