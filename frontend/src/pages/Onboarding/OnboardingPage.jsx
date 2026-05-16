import { useState, useEffect, useRef } from "react";
import {
  extractContract, publishOnboarding, multiPublish,
  downloadBulkTemplate, bulkOnboard,
} from "../../api/onboarding";
import { fetchCatalogBrief } from "../../api/catalog";
import { fetchAllMasters } from "../../api/masters";
import { fetchOwners, fetchDOA } from "../../api/owners";

// ── Helpers ───────────────────────────────────────────────────────────────────
function newItem(idx) {
  return {
    id: `item-${Date.now()}-${idx}`,
    contractName: "", canonicalName: "", swId: "",
    isExisting: false, isAiDetected: false,
    licenseType: "subscription", metricId: "",
    entitledCount: "", unitCostInr: "", annualCostInr: "",
    regionId: "", gxpFlag: "no", aliasInput: "", aliases: [],
    categoryId: "", subCategoryId: "", deployment: "cloud", vendorRisk: "LOW",
    aiEntitled: null,
  };
}

function fmtINR(n) {
  if (!n) return "";
  const v = parseInt(n);
  if (isNaN(v)) return "";
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)} Cr`;
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(0)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

// ── Stepper ───────────────────────────────────────────────────────────────────
const STEPS = ["Upload Contract","AI Extraction","Line Items","SW Metadata","Owner & DOA","Source Config","Review & Publish"];

function Stepper({ current, draftsCount, onDrafts }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {STEPS.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : 0 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
              background: i < current ? "var(--green-m)" : i === current ? "var(--navy-mid)" : "var(--bdr)",
              color: i <= current ? "#fff" : "var(--tx-q)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700,
            }}>
              {i < current ? "✓" : i + 1}
            </div>
            <div style={{ fontSize: 9.5, whiteSpace: "nowrap", color: i === current ? "var(--navy-mid)" : "var(--tx-q)", fontWeight: i === current ? 700 : 400 }}>
              {s}
            </div>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{ flex: 1, height: 2, background: i < current ? "var(--green-m)" : "var(--bdr)", margin: "0 4px", marginBottom: 18 }} />
          )}
        </div>
      ))}
      {draftsCount > 0 && (
        <button onClick={onDrafts} style={{ marginLeft: 16, flexShrink: 0, display: "flex", alignItems: "center", gap: 6, fontSize: 12, background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 6, padding: "5px 12px", cursor: "pointer", color: "var(--tx-m)" }}>
          <span>💾</span> Saved Drafts <span style={{ background: "var(--navy-mid)", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{draftsCount}</span>
        </button>
      )}
    </div>
  );
}

// ── Method Selection ──────────────────────────────────────────────────────────
function MethodSelection({ onSelect }) {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 11, color: "var(--tx-q)", marginBottom: 4 }}>SAM Platform <span style={{ color: "var(--tx-m)" }}>›</span> Onboard Software</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Onboard New Software / License</h1>
      <p style={{ fontSize: 13, color: "var(--tx-m)", marginBottom: 28 }}>Choose how you want to onboard software licenses into the SAM platform.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 820 }}>
        <div style={{ border: "2px solid var(--bdr)", borderRadius: 12, padding: 28, cursor: "pointer" }}
          onClick={() => onSelect("manual")}
          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--navy-mid)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--bdr)"}
        >
          <div style={{ fontSize: 28, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Manual Onboarding</div>
          <div style={{ fontSize: 13, color: "var(--tx-m)", lineHeight: 1.7, marginBottom: 20 }}>
            Upload a signed contract · AI extracts key terms · assign canonical names per line item · publish each as its own SW_ID + ENT_ID.
          </div>
          <ul style={{ fontSize: 12, color: "var(--tx-m)", paddingLeft: 16, lineHeight: 2, marginBottom: 20 }}>
            <li>AI extraction from PDF/DOCX contract</li>
            <li>Multiple line items → separate SW_IDs</li>
            <li>Full metadata + owner + source config</li>
          </ul>
          <button className="btn btn-p btn-sm" style={{ background: "var(--navy-mid)" }}>Start Manual →</button>
        </div>
        <div style={{ border: "2px solid var(--bdr)", borderRadius: 12, padding: 28, cursor: "pointer" }}
          onClick={() => onSelect("bulk")}
          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--teal-m)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--bdr)"}
        >
          <div style={{ fontSize: 28, marginBottom: 12 }}>📥</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Bulk Upload via Template</div>
          <div style={{ fontSize: 13, color: "var(--tx-m)", lineHeight: 1.7, marginBottom: 20 }}>
            Download the master template, fill in multiple software entries with contract and license details, then upload in one go.
          </div>
          <ul style={{ fontSize: 12, color: "var(--tx-m)", paddingLeft: 16, lineHeight: 2, marginBottom: 20 }}>
            <li>Multiple entries in a single upload</li>
            <li>Pre-formatted XLSX with example row</li>
            <li>Auto-creates SW_IDs, ENT_IDs, Contracts</li>
          </ul>
          <button className="btn btn-p btn-sm" style={{ background: "var(--teal-m)" }}>Download Template →</button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Upload Flow ──────────────────────────────────────────────────────────
function BulkUploadFlow({ onBack }) {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const handleDownload = async () => {
    const blob = await downloadBulkTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = "DRL_BulkOnboarding_Template.xlsx"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleProcess = async () => {
    if (!file) return;
    setProcessing(true); setError(null);
    try { setResult(await bulkOnboard(file)); }
    catch (e) { setError(e?.response?.data?.detail || "Processing failed."); }
    finally { setProcessing(false); }
  };

  return (
    <div style={{ padding: "18px 32px" }}>
      <div style={{ fontSize: 11, color: "var(--tx-q)", marginBottom: 4 }}>
        <span style={{ cursor: "pointer", color: "var(--blue-m)" }} onClick={onBack}>Onboard Software</span> › Bulk Upload
      </div>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 14 }}>Bulk Software Onboarding</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 14, background: "#EFF6FF", border: "1.5px dashed #93C5FD", borderRadius: 8, padding: "12px 16px", marginBottom: 20 }}>
        <div style={{ width: 36, height: 36, borderRadius: 6, background: "#DBEAFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📄</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1E40AF", marginBottom: 2 }}>DRL_BulkOnboarding_Template.xlsx</div>
          <div style={{ fontSize: 11, color: "#3B82F6" }}>Software Name · SW_ID · Publisher · Category · Deployment · GxP · Contract Name · PO · Dates · License Type · Metric · Seats · Costs</div>
        </div>
        <button style={{ background: "var(--navy-mid)", color: "#fff", border: "none", borderRadius: 6, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={handleDownload}>↓ Download Template</button>
      </div>
      {!result && (
        <div style={{ border: "1px solid var(--bdr)", borderRadius: 10, padding: 24, maxWidth: 600 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Step 2 — Upload Filled Template</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={e => setFile(e.target.files?.[0] || null)} />
            <button className="btn btn-o btn-sm" onClick={() => fileRef.current?.click()}>Choose File</button>
            {file ? <span style={{ fontSize: 12, color: "var(--teal-m)", fontWeight: 600 }}>{file.name}</span>
                  : <span style={{ fontSize: 12, color: "var(--tx-q)" }}>No file selected · .xlsx only</span>}
            {file && <button style={{ background: "none", border: "none", color: "var(--tx-q)", cursor: "pointer" }} onClick={() => { setFile(null); fileRef.current.value = ""; }}>✕</button>}
          </div>
          {error && <div style={{ background: "#fff0f0", border: "1px solid var(--red-m)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--red-m)", marginBottom: 12 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-p btn-sm" style={{ background: "var(--navy-mid)" }} disabled={!file || processing} onClick={handleProcess}>{processing ? "Processing…" : "Process & Create Records"}</button>
            <button className="btn btn-o btn-sm" onClick={onBack}>← Back</button>
          </div>
        </div>
      )}
      {result && (
        <div style={{ border: "1px solid var(--bdr)", borderRadius: 10, padding: 24, maxWidth: 600 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: "var(--green-m)" }}>Bulk onboarding complete</div>
          <div style={{ fontSize: 13, lineHeight: 2, marginBottom: 14 }}>
            <div><strong>{result.sw_created}</strong> SW entries created: {result.sw_ids?.join(", ")}</div>
            <div><strong>{result.ent_created}</strong> entitlements: {result.ent_ids?.join(", ")}</div>
          </div>
          {result.skipped?.length > 0 && <div style={{ background: "var(--amber-l)", border: "1px solid var(--amber-m)", borderRadius: 6, padding: "10px 12px", fontSize: 12, color: "var(--amber-m)", marginBottom: 14 }}><strong>{result.skipped.length} skipped:</strong><ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>{result.skipped.map((s,i) => <li key={i}>{s}</li>)}</ul></div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-p btn-sm" style={{ background: "var(--navy-mid)" }} onClick={() => { setResult(null); setFile(null); }}>Upload Another</button>
            <button className="btn btn-o btn-sm" onClick={onBack}>← Back</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Line Item Card ────────────────────────────────────────────────────────────
function LineItemCard({ item, idx, onChange, onRemove, catalogBrief, categories, metrics, regions }) {
  const subCats = categories.find(c => c.id === item.categoryId)?.sub_categories || [];

  const handleCanonical = (val) => {
    const match = catalogBrief.find(c => c.canonical_name.toLowerCase() === val.toLowerCase());
    onChange({ ...item, canonicalName: val, swId: match ? match.sw_id : "", isExisting: !!match });
  };

  const handleEntitled = (val) => {
    const seats = parseInt(val) || 0;
    const cost  = parseInt(item.unitCostInr) || 0;
    onChange({ ...item, entitledCount: val, annualCostInr: seats && cost ? String(seats * cost) : "" });
  };

  const handleUnit = (val) => {
    const seats = parseInt(item.entitledCount) || 0;
    const cost  = parseInt(val) || 0;
    onChange({ ...item, unitCostInr: val, annualCostInr: seats && cost ? String(seats * cost) : "" });
  };

  const addAlias = () => {
    if (!item.aliasInput.trim()) return;
    onChange({ ...item, aliases: [...item.aliases, item.aliasInput.trim()], aliasInput: "" });
  };

  const ambSeats = item.aiDetected && item.aiEntitled != null;

  return (
    <div style={{ border: item.isExisting ? "1px solid var(--bdr)" : "1.5px solid var(--amber-m)", borderRadius: 10, marginBottom: 16, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ background: item.isExisting ? "var(--surf)" : "#FFFBEB", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--bdr)" }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--navy-mid)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{idx + 1}</div>
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{item.contractName || <span style={{ color: "var(--tx-q)", fontStyle: "italic" }}>Untitled</span>}</span>
        {item.isAiDetected && item.isExisting && <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 3, background: "var(--green-l)", color: "var(--green-m)" }}>AI-detected</span>}
        {item.isAiDetected && !item.isExisting && <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 3, background: "var(--amber-l)", color: "var(--amber-m)" }}>⚠ New — No existing SW_ID</span>}
        <button style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 4, border: "1px solid var(--red-m)", background: "none", color: "var(--red-m)", cursor: "pointer" }} onClick={onRemove}>Remove</button>
      </div>

      <div style={{ padding: 16 }}>
        {/* New SW warning */}
        {!item.isExisting && item.canonicalName && (
          <div style={{ background: "#FFFBEB", border: "1px solid var(--amber-m)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--amber-m)", marginBottom: 14 }}>
            ⚠ No matching canonical name found for "{item.canonicalName}". A new Software Catalog entry will be created. Please confirm the Canonical Name and a new SW_ID will be auto-generated.
          </div>
        )}

        {/* Row 1: Contract Name | Canonical Name | SW_ID */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Contract Software Name <span style={{ color: "var(--red-m)" }}>*</span></label>
            <input className="fi2" style={{ width: "100%" }} value={item.contractName} onChange={e => onChange({ ...item, contractName: e.target.value })} placeholder="As written in the contract" />
            <div style={{ fontSize: 10, color: "var(--tx-q)", marginTop: 3 }}>As written in the contract / as reported by discovery tools</div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: !item.isExisting && item.canonicalName ? "var(--amber-m)" : "var(--tx-q)", display: "block", marginBottom: 4 }}>
              Canonical Name (SW) <span style={{ color: "var(--red-m)" }}>*</span>
            </label>
            <input
              className="fi2"
              style={{ width: "100%", borderColor: !item.isExisting && item.canonicalName ? "var(--amber-m)" : undefined, background: !item.isExisting && item.canonicalName ? "#FFFBEB" : undefined }}
              list={`catalog-${item.id}`}
              value={item.canonicalName}
              onChange={e => handleCanonical(e.target.value)}
              placeholder="Standardised platform name"
            />
            <datalist id={`catalog-${item.id}`}>
              {catalogBrief.map(c => <option key={c.sw_id} value={c.canonical_name} />)}
            </datalist>
            <div style={{ fontSize: 10, color: item.isExisting ? "var(--green-m)" : "var(--amber-m)", marginTop: 3 }}>
              {item.isExisting ? "Standardised platform name → links to catalog master" : item.canonicalName ? "This will create a NEW Software Catalog entry" : "Select or create canonical name"}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>SW_ID <span style={{ color: "var(--red-m)" }}>*</span></label>
            <input className="fi2" style={{ width: "100%", background: "var(--surf)", color: "var(--tx-m)" }}
              value={item.swId || (!item.isExisting && item.canonicalName ? "(auto)" : "")}
              readOnly
              placeholder="Auto-assigned"
            />
            <div style={{ fontSize: 10, color: "var(--tx-q)", marginTop: 3 }}>
              {item.isExisting ? "Auto-assigned from Canonical Name · New name = new SW_ID" : "Generated on publish · next available"}
            </div>
          </div>
        </div>

        {/* Row 2: License Type | Metric | ENT_ID */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>License Type</label>
            <select className="fi2" style={{ width: "100%" }} value={item.licenseType} onChange={e => onChange({ ...item, licenseType: e.target.value })}>
              <option value="subscription">Subscription</option>
              <option value="perpetual">Perpetual</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>License Metric</label>
            <select className="fi2" style={{ width: "100%" }} value={item.metricId} onChange={e => onChange({ ...item, metricId: e.target.value })}>
              <option value="">Select metric…</option>
              {metrics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>ENT_ID (auto-generated)</label>
            <input className="fi2" style={{ width: "100%", background: "var(--surf)", color: "var(--tx-m)" }} value={`ENT-${String(idx + 1).padStart(3, "0")} (auto)`} readOnly />
            <div style={{ fontSize: 10, color: "var(--tx-q)", marginTop: 3 }}>Created on publish · links contract to catalog</div>
          </div>
        </div>

        {/* Row 3: Entitled Seats | Unit Cost | Annual Cost */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div style={{ border: ambSeats ? "1.5px solid var(--amber-m)" : "none", borderRadius: ambSeats ? 6 : 0, padding: ambSeats ? "8px 10px" : 0, background: ambSeats ? "#FFFBEB" : "transparent" }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: ambSeats ? "var(--amber-m)" : "var(--tx-q)", display: "block", marginBottom: 4 }}>
              Entitled Seats / Units {ambSeats && "⚠"}
            </label>
            <input className="fi2" style={{ width: "100%" }} type="number" value={item.entitledCount} onChange={e => handleEntitled(e.target.value)} placeholder={ambSeats ? `e.g. ${item.aiEntitled}` : "e.g. 500"} />
            {ambSeats && <div style={{ fontSize: 10, color: "var(--amber-m)", marginTop: 3 }}>Extracted: ~{item.aiEntitled} — confirm from contract</div>}
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Unit Cost (₹)</label>
            <input className="fi2" style={{ width: "100%" }} type="number" value={item.unitCostInr} onChange={e => handleUnit(e.target.value)} placeholder="e.g. 3,600" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Annual Cost (₹)</label>
            <input className="fi2" style={{ width: "100%", background: "var(--surf)", color: "var(--tx-m)" }}
              value={item.annualCostInr ? fmtINR(item.annualCostInr) : ""}
              readOnly placeholder="Auto = Seats × Unit Cost" />
          </div>
        </div>

        {/* Row 4: Region | GxP */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Region / Scope</label>
            <select className="fi2" style={{ width: "100%" }} value={item.regionId} onChange={e => onChange({ ...item, regionId: e.target.value })}>
              <option value="">Use shared default</option>
              {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>GxP Relevant?</label>
            <select className="fi2" style={{ width: "100%" }} value={item.gxpFlag === "no" ? "no" : "yes"} onChange={e => onChange({ ...item, gxpFlag: e.target.value === "yes" ? "yes_21cfr" : "no" })}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        </div>

        {/* New catalog entry metadata */}
        {!item.isExisting && item.canonicalName && (
          <div style={{ border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 14, background: "var(--surf)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>New Catalog Entry — Metadata Required</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Category <span style={{ color: "var(--red-m)" }}>*</span></label>
                <select className="fi2" style={{ width: "100%" }} value={item.categoryId} onChange={e => onChange({ ...item, categoryId: e.target.value, subCategoryId: "" })}>
                  <option value="">Select…</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Sub-Category <span style={{ color: "var(--red-m)" }}>*</span></label>
                <select className="fi2" style={{ width: "100%" }} value={item.subCategoryId} onChange={e => onChange({ ...item, subCategoryId: e.target.value })} disabled={!item.categoryId}>
                  <option value="">{item.categoryId ? "Select…" : "Select category first"}</option>
                  {subCats.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>GxP Relevant?</label>
                <select className="fi2" style={{ width: "100%" }} value={item.gxpFlag === "no" ? "no" : "yes"} onChange={e => onChange({ ...item, gxpFlag: e.target.value === "yes" ? "yes_21cfr" : "no" })}>
                  <option value="no">No</option><option value="yes">Yes</option>
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Deployment</label>
                <select className="fi2" style={{ width: "100%" }} value={item.deployment} onChange={e => onChange({ ...item, deployment: e.target.value })}>
                  <option value="cloud">Cloud</option><option value="on_premise">On-Premise</option>
                  <option value="desktop_cloud">Desktop/Cloud</option><option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Vendor Audit Risk</label>
                <select className="fi2" style={{ width: "100%" }} value={item.vendorRisk} onChange={e => onChange({ ...item, vendorRisk: e.target.value })}>
                  <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Aliases */}
        <div style={{ borderTop: "1px solid var(--bdr)", paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "var(--tx-q)" }}>🔗</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-m)" }}>
              Other Contract Name Aliases → Same Canonical ({item.swId || "auto"})
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {item.aliases.map((a, ai) => (
              <span key={ai} style={{ fontSize: 11, background: "var(--navy-xlt)", color: "var(--navy-mid)", borderRadius: 12, padding: "2px 10px", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10, opacity: 0.7 }}>alias</span> {a}
                <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx-q)", fontSize: 11, padding: 0 }} onClick={() => onChange({ ...item, aliases: item.aliases.filter((_, i) => i !== ai) })}>×</button>
              </span>
            ))}
            <button style={{ fontSize: 11, padding: "2px 10px", borderRadius: 12, border: "1px solid var(--bdr)", background: "none", cursor: "pointer" }}
              onClick={() => { const v = prompt("Add alias:"); if (v?.trim()) onChange({ ...item, aliases: [...item.aliases, v.trim()] }); }}>
              + Add Alias
            </button>
          </div>
          <div style={{ fontSize: 10, color: "var(--tx-q)" }}>Aliases are alternative names reported by discovery sources — all map to the same SW_ID</div>
        </div>
      </div>
    </div>
  );
}

// ── Manual Flow ───────────────────────────────────────────────────────────────
function ManualFlow({ onBack }) {
  const [file, setFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [extractError, setExtractError] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState(null);
  const [fileSize, setFileSize] = useState(null);

  // Step 1-2: Contract header
  const [meta, setMeta] = useState({ vendorName: "", reseller: "", poNumber: "", clmId: "", startDate: "", endDate: "", totalValue: "", autoRenewal: "" });

  // Step 3: Line items
  const [lineItems, setLineItems] = useState([newItem(0)]);

  // Step 4-6: Shared metadata
  const [sharedDeployment, setSharedDeployment] = useState("cloud");
  const [sharedRegionId, setSharedRegionId] = useState("");
  const [notes, setNotes] = useState("");
  const [appOwnerId, setAppOwnerId] = useState("");
  const [discoverySourceId, setDiscoverySourceId] = useState("");
  const [usageMethodId, setUsageMethodId] = useState("");

  // Masters
  const [categories, setCategories] = useState([]);
  const [regions, setRegions] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [sources, setSources] = useState([]);
  const [methods, setMethods] = useState([]);
  const [owners, setOwners] = useState([]);
  const [doaContacts, setDoaContacts] = useState([]);
  const [catalogBrief, setCatalogBrief] = useState([]);

  // Publish
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(null);
  const [publishError, setPublishError] = useState("");

  // Stepper tracking
  const currentStep = !uploadedFileName ? 0 : !extracted ? 1 : 2;

  useEffect(() => {
    Promise.all([fetchAllMasters(), fetchOwners(), fetchCatalogBrief(), fetchDOA()])
      .then(([masters, ownerList, brief, doa]) => {
        setCategories(masters.categories || []);
        setRegions(masters.regions || []);
        setMetrics(masters.metrics || []);
        setSources(masters.discovery_sources || []);
        setMethods(masters.usage_methods || []);
        setOwners(ownerList || []);
        setDoaContacts(doa || []);
        setCatalogBrief(brief || []);
      }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!extracted) return;
    setMeta({
      vendorName: extracted.vendor_name || "",
      reseller: extracted.reseller || "",
      poNumber: extracted.po_number || "",
      clmId: extracted.clm_id || "",
      startDate: extracted.start_date || "",
      endDate: extracted.end_date || "",
      totalValue: extracted.total_value_inr ?? "",
      autoRenewal: extracted.auto_renewal_clause || "",
    });
    if (extracted.line_items?.length) {
      setLineItems(extracted.line_items.map((li, i) => {
        const match = catalogBrief.find(c => c.canonical_name.toLowerCase() === (li.contract_name || "").toLowerCase());
        return {
          ...newItem(i),
          contractName: li.contract_name || "",
          canonicalName: match ? match.canonical_name : (li.contract_name || ""),
          swId: match ? match.sw_id : "",
          isExisting: !!match,
          isAiDetected: true,
          licenseType: li.license_type || "subscription",
          entitledCount: li.entitled_count ?? "",
          unitCostInr: li.unit_cost_inr ?? "",
          annualCostInr: li.annual_cost_inr ?? "",
          aiEntitled: li.entitled_count || null,
        };
      }));
    }
  }, [extracted, catalogBrief]);

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true); setExtractError("");
    try {
      const r = await extractContract(file);
      setExtracted(r);
      setUploadedFileName(file.name);
      setFileSize(file.size);
    } catch (e) {
      setExtractError(e?.response?.data?.detail || "Extraction failed.");
    } finally { setExtracting(false); }
  };

  const updateItem = (id, updated) => setLineItems(ls => ls.map(l => l.id === id ? updated : l));
  const removeItem = (id) => setLineItems(ls => ls.filter(l => l.id !== id));
  const addItem = () => setLineItems(ls => [...ls, newItem(ls.length)]);

  // Summary stats
  const totalItems = lineItems.length;
  const existingCount = lineItems.filter(l => l.isExisting).length;
  const newCount = lineItems.filter(l => !l.isExisting && l.canonicalName).length;
  const amberCount = lineItems.filter(l => l.aiEntitled != null && !l.entitledCount).length;

  const autoFillCount = extracted
    ? Object.values(meta).filter(Boolean).length
    : 0;

  const handlePublish = async (onlyReady = false) => {
    setPublishing(true); setPublishError("");
    try {
      const items = onlyReady ? lineItems.filter(l => l.contractName && l.canonicalName && l.entitledCount) : lineItems.filter(l => l.contractName && l.canonicalName);
      if (!items.length) { setPublishError("No valid line items to publish."); setPublishing(false); return; }

      const payload = {
        vendor_name: meta.vendorName || undefined,
        reseller: meta.reseller || undefined,
        po_number: meta.poNumber || undefined,
        clm_id: meta.clmId || undefined,
        start_date: meta.startDate || undefined,
        end_date: meta.endDate || undefined,
        total_value_inr: meta.totalValue ? parseInt(meta.totalValue) : undefined,
        auto_renewal_clause: meta.autoRenewal || undefined,
        deployment: sharedDeployment,
        region_id: sharedRegionId || undefined,
        notes: notes || undefined,
        app_owner_id: appOwnerId || undefined,
        discovery_source_id: discoverySourceId || undefined,
        usage_method_id: usageMethodId || undefined,
        line_items: items.map(li => ({
          contract_name: li.contractName,
          canonical_name: li.canonicalName,
          sw_id: li.swId || undefined,
          license_type: li.licenseType,
          metric_id: li.metricId || undefined,
          entitled_count: li.entitledCount ? parseInt(li.entitledCount) : undefined,
          unit_cost_inr: li.unitCostInr ? parseInt(li.unitCostInr) : undefined,
          annual_cost_inr: li.annualCostInr ? parseInt(li.annualCostInr) : undefined,
          region_id: li.regionId || undefined,
          gxp_flag: li.gxpFlag,
          aliases: li.aliases,
          category_id: li.categoryId || undefined,
          sub_category_id: li.subCategoryId || undefined,
          deployment: li.deployment || sharedDeployment,
          vendor_risk: li.vendorRisk,
        })),
      };
      const result = await multiPublish(payload);
      setPublished(result);
    } catch (e) {
      setPublishError(e?.response?.data?.detail || "Publish failed. Review all required fields.");
    } finally { setPublishing(false); }
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (published) {
    return (
      <div style={{ padding: "28px 32px" }}>
        <div style={{ fontSize: 11, color: "var(--tx-q)", marginBottom: 4 }}>
          <span style={{ cursor: "pointer", color: "var(--blue-m)" }} onClick={onBack}>Onboard Software</span> › Manual
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Onboarding Complete</h1>
        <div style={{ border: "1px solid var(--bdr)", borderRadius: 10, padding: 28, maxWidth: 600 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: "var(--green-m)" }}>
            {published.created.length} software entitlement{published.created.length !== 1 ? "s" : ""} created successfully
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
            <thead><tr style={{ background: "var(--surf)" }}>
              <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, fontSize: 10, color: "var(--tx-q)", borderBottom: "2px solid var(--bdr)" }}>CONTRACT NAME</th>
              <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, fontSize: 10, color: "var(--tx-q)", borderBottom: "2px solid var(--bdr)" }}>CANONICAL</th>
              <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, fontSize: 10, color: "var(--tx-q)", borderBottom: "2px solid var(--bdr)" }}>SW_ID</th>
              <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, fontSize: 10, color: "var(--tx-q)", borderBottom: "2px solid var(--bdr)" }}>ENT_ID</th>
            </tr></thead>
            <tbody>{published.created.map((c, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--bdr)" }}>
                <td style={{ padding: "7px 10px" }}>{c.contract_name}</td>
                <td style={{ padding: "7px 10px", fontWeight: 600 }}>{c.canonical_name}</td>
                <td style={{ padding: "7px 10px" }}><code style={{ fontSize: 11, background: "var(--bg2)", padding: "1px 5px", borderRadius: 3 }}>{c.sw_id}</code></td>
                <td style={{ padding: "7px 10px" }}><code style={{ fontSize: 11, background: "var(--bg2)", padding: "1px 5px", borderRadius: 3 }}>{c.ent_id}</code></td>
              </tr>
            ))}</tbody>
          </table>
          {published.skipped?.length > 0 && <div style={{ background: "var(--amber-l)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--amber-m)", marginBottom: 12 }}>{published.skipped.length} items skipped: {published.skipped.join("; ")}</div>}
          <button className="btn btn-p btn-sm" style={{ background: "var(--navy-mid)" }} onClick={onBack}>Onboard Another</button>
        </div>
      </div>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "18px 28px 40px", overflowY: "auto", height: "calc(100vh - 52px)" }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "var(--tx-q)", marginBottom: 3 }}>
          <span style={{ cursor: "pointer", color: "var(--blue-m)" }} onClick={onBack}>Onboard Software</span> › Manual
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 3 }}>Onboard New Software / License</h1>
        <p style={{ fontSize: 12, color: "var(--tx-m)" }}>One contract → one or many software line items · Each line item gets its own SW_ID + ENT_ID + Catalog entry</p>
      </div>

      {/* Stepper */}
      <div style={{ marginBottom: 20 }}>
        <Stepper current={currentStep} draftsCount={0} onDrafts={() => {}} />
      </div>

      {/* ── Steps 1–2: Contract Header ─────────────────────────────────────── */}
      <div style={{ border: "1px solid var(--bdr)", borderRadius: 10, marginBottom: 20, overflow: "hidden" }}>
        <div style={{ background: "var(--surf)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--bdr)" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Step 1–2 — Contract Header (AI-Extracted)</div>
            <div style={{ fontSize: 11, color: "var(--tx-q)", marginTop: 2 }}>One contract · shared fields apply to all line items below</div>
          </div>
          {uploadedFileName && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4, background: "var(--green-l)", color: "var(--green-m)" }}>
              ✓ Uploaded{extracted ? ` · ${autoFillCount}/13 auto-filled` : ""}
            </span>
          )}
        </div>
        <div style={{ padding: 20 }}>
          {/* File upload row */}
          {!uploadedFileName ? (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                <input type="file" accept=".pdf,.docx,.doc" className="fi2" style={{ flex: 1 }}
                  onChange={e => { setFile(e.target.files?.[0] || null); setFileSize(e.target.files?.[0]?.size || null); }} />
                <button className="btn btn-p btn-sm" style={{ background: "var(--navy-mid)", whiteSpace: "nowrap" }} onClick={handleExtract} disabled={!file || extracting}>
                  {extracting ? "Extracting…" : "Extract with AI →"}
                </button>
                <button className="btn btn-o btn-sm" style={{ whiteSpace: "nowrap" }} onClick={() => { setUploadedFileName("manual"); }}>Skip</button>
              </div>
              {extractError && <div style={{ color: "var(--red-m)", fontSize: 12 }}>{extractError}</div>}
              <div style={{ fontSize: 11, color: "var(--tx-q)" }}>Upload PDF or DOCX · Max 25 MB · AI extracts vendor, PO, dates and line items</div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--navy-xlt)", borderRadius: 6, padding: "10px 14px", marginBottom: 18 }}>
              <span style={{ fontSize: 16 }}>📄</span>
              <div style={{ flex: 1, fontSize: 12 }}>
                <span style={{ fontWeight: 600, color: "var(--navy-mid)" }}>{uploadedFileName === "manual" ? "Manual entry (no contract uploaded)" : uploadedFileName}</span>
                {fileSize && <span style={{ color: "var(--tx-m)", marginLeft: 8 }}>· {(fileSize / 1024 / 1024).toFixed(1)} MB</span>}
                <span style={{ color: "var(--tx-m)", marginLeft: 8 }}>· Previous contracts archived to AWS S3 automatically</span>
              </div>
              <button className="btn btn-o btn-sm" style={{ fontSize: 11 }} onClick={() => { setUploadedFileName(null); setExtracted(null); setFile(null); }}>Change</button>
            </div>
          )}

          {/* Contract fields grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Vendor / Publisher <span style={{ color: "var(--red-m)" }}>*</span></label>
              <input className="fi2" style={{ width: "100%" }} value={meta.vendorName} onChange={e => setMeta(m => ({ ...m, vendorName: e.target.value }))} placeholder="e.g. Microsoft Corporation" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Reseller / Vendor Name</label>
              <input className="fi2" style={{ width: "100%" }} value={meta.reseller} onChange={e => setMeta(m => ({ ...m, reseller: e.target.value }))} placeholder="e.g. Microsoft EA Direct" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>PO Number <span style={{ color: "var(--red-m)" }}>*</span></label>
              <input className="fi2" style={{ width: "100%" }} value={meta.poNumber} onChange={e => setMeta(m => ({ ...m, poNumber: e.target.value }))} placeholder="EA-2026-MSFT-001" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>CLM ID <span style={{ color: "var(--red-m)" }}>*</span></label>
              <input className="fi2" style={{ width: "100%" }} value={meta.clmId} onChange={e => setMeta(m => ({ ...m, clmId: e.target.value }))} placeholder="e.g. CLM-2026-00241" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Contract Start Date</label>
              <input className="fi2" style={{ width: "100%" }} type="date" value={meta.startDate} onChange={e => setMeta(m => ({ ...m, startDate: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Contract End Date</label>
              <input className="fi2" style={{ width: "100%" }} type="date" value={meta.endDate} onChange={e => setMeta(m => ({ ...m, endDate: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ border: !meta.autoRenewal ? "1.5px solid var(--amber-m)" : "1px solid var(--bdr)", borderRadius: 6, padding: "10px 12px", background: !meta.autoRenewal ? "#FFFBEB" : "transparent" }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: !meta.autoRenewal ? "var(--amber-m)" : "var(--tx-q)", display: "block", marginBottom: 4 }}>
                Auto-Renewal Clause {!meta.autoRenewal && "⚠"}
              </label>
              <select className="fi2" style={{ width: "100%" }} value={meta.autoRenewal} onChange={e => setMeta(m => ({ ...m, autoRenewal: e.target.value }))}>
                <option value="">Select…</option>
                <option value="yes">Yes</option><option value="no">No</option><option value="opt_in">Opt-In</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Total Contract Value (₹)</label>
              <input className="fi2" style={{ width: "100%" }} type="number" value={meta.totalValue} onChange={e => setMeta(m => ({ ...m, totalValue: e.target.value }))} placeholder="e.g. 1,04,02,500" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Step 3: Line Items ─────────────────────────────────────────────── */}
      <div style={{ border: "1px solid var(--bdr)", borderRadius: 10, marginBottom: 20, overflow: "hidden" }}>
        <div style={{ background: "var(--surf)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--bdr)" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Step 3 — Contract Line Items</div>
            <div style={{ fontSize: 11, color: "var(--tx-q)", marginTop: 2 }}>Each line item = one Contract Software Name → one Canonical Name → one SW_ID + one ENT_ID</div>
          </div>
          <button className="btn btn-p btn-sm" style={{ background: "var(--navy-mid)", whiteSpace: "nowrap" }} onClick={addItem}>+ Add Line Item</button>
        </div>
        <div style={{ padding: 20 }}>
          {/* How this works */}
          <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: "#1E40AF", lineHeight: 1.7 }}>
            <strong>How this works:</strong> A single contract (e.g. Microsoft EA) can contain multiple software line items — each with a different name as written in the contract, a different canonical platform name, and different seat counts / costs. Each line item generates its own <code style={{ fontSize: 11, background: "#DBEAFE", padding: "1px 4px", borderRadius: 3 }}>SW_ID</code> and <code style={{ fontSize: 11, background: "#DBEAFE", padding: "1px 4px", borderRadius: 3 }}>ENT_ID</code> and its own catalog entry.
            <br />
            <strong>Example:</strong> Microsoft EA has 4 line items → MS-001 (M365 E3), MS-002 (M365 E5), MS-003 (Visio), MS-005 (Power BI Pro) — all under PO <code style={{ fontSize: 11, background: "#DBEAFE", padding: "1px 4px", borderRadius: 3 }}>{meta.poNumber || "EA-2026-MSFT-001"}</code>.
          </div>
          {/* AI detection notice */}
          {extracted && lineItems.some(l => l.isAiDetected) && (
            <div style={{ background: "var(--green-l)", border: "1px solid var(--green-m)", borderRadius: 6, padding: "8px 14px", marginBottom: 16, fontSize: 12, color: "var(--green-m)", lineHeight: 1.6 }}>
              ✓ AI detected <strong>{lineItems.filter(l => l.isAiDetected).length} line item{lineItems.filter(l => l.isAiDetected).length !== 1 ? "s" : ""}</strong> in this contract. Review the mapping below — confirm or edit the Canonical Name and SW_ID for each. Items with an existing SW_ID will update the catalog entry; new SW_IDs will create a new catalog entry.
            </div>
          )}
          {lineItems.map((item, idx) => (
            <LineItemCard
              key={item.id}
              item={item} idx={idx}
              onChange={updated => updateItem(item.id, updated)}
              onRemove={() => removeItem(item.id)}
              catalogBrief={catalogBrief}
              categories={categories}
              metrics={metrics}
              regions={regions}
            />
          ))}
        </div>
      </div>

      {/* ── Summary bar ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: "10px 20px", marginBottom: 20, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--tx-m)" }}>Line items: <strong>{totalItems}</strong></span>
        <span style={{ fontSize: 12 }}>SW_IDs to create/update: <span style={{ color: "var(--green-m)", fontWeight: 600 }}>{existingCount} update</span>{newCount > 0 && <> · <span style={{ color: "var(--amber-m)", fontWeight: 600 }}>{newCount} new</span></>}</span>
        <span style={{ fontSize: 12, color: "var(--tx-m)" }}>ENT_IDs to generate: <strong>{totalItems}</strong></span>
        {amberCount > 0 && <span style={{ fontSize: 12, color: "var(--amber-m)", fontWeight: 600 }}>⚠ Items needing input: {amberCount} fields amber</span>}
        <button className="btn btn-o btn-sm" style={{ marginLeft: "auto" }} onClick={addItem}>+ Add Line Item</button>
      </div>

      {/* ── Steps 4-5-6: Shared Metadata + Owner + Source ──────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Step 4: Shared Metadata */}
        <div style={{ border: "1px solid var(--bdr)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ background: "var(--surf)", padding: "12px 16px", borderBottom: "1px solid var(--bdr)" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Step 4 — Shared Metadata</div>
            <div style={{ fontSize: 11, color: "var(--tx-q)", marginTop: 2 }}>Applied to all line items in this contract unless overridden per-item above</div>
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ background: "var(--navy-xlt)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--navy-mid)", marginBottom: 14 }}>
              Fields set here apply to all line items. Per-item overrides (GxP, category) are set in each line item block above.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Deployment</label>
                <select className="fi2" style={{ width: "100%" }} value={sharedDeployment} onChange={e => setSharedDeployment(e.target.value)}>
                  <option value="cloud">Cloud</option><option value="on_premise">On-Premise</option>
                  <option value="desktop_cloud">Desktop/Cloud</option><option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Region / Scope <span style={{ color: "var(--red-m)" }}>*</span></label>
                <select className="fi2" style={{ width: "100%" }} value={sharedRegionId} onChange={e => setSharedRegionId(e.target.value)}>
                  <option value="">Select region…</option>
                  {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Notes / Business Description (shared)</label>
              <textarea className="fi2" rows={4} style={{ width: "100%", resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Microsoft Enterprise Agreement 2026 — covers all Microsoft 365 productivity, collaboration, BI, and security products for DRL globally." />
            </div>
          </div>
        </div>

        {/* Steps 5 + 6 stacked */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Step 5: Owner & DOA */}
          <div style={{ border: "1px solid var(--bdr)", borderRadius: 10, overflow: "hidden", flex: 1 }}>
            <div style={{ background: "var(--surf)", padding: "12px 16px", borderBottom: "1px solid var(--bdr)" }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Step 5 — Owner &amp; DOA Escalation</div>
              <div style={{ fontSize: 11, color: "var(--tx-q)", marginTop: 2 }}>Applies to all line items unless individually overridden</div>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Primary App Owner <span style={{ color: "var(--red-m)" }}>*</span></label>
                  <select className="fi2" style={{ width: "100%" }} value={appOwnerId} onChange={e => setAppOwnerId(e.target.value)}>
                    <option value="">Select from masters…</option>
                    {owners.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.full_name} ({o.business_unit || o.role})</option>)}
                  </select>
                  <div style={{ fontSize: 10, color: "var(--tx-q)", marginTop: 3 }}>Populated from App Owner Master</div>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Secondary Owner</label>
                  <select className="fi2" style={{ width: "100%" }}>
                    <option value="">Select from masters…</option>
                    {owners.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 8 }}>DOA Escalation</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {doaContacts.slice(0, 3).map(d => (
                    <span key={d.id} style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 4, background: "var(--navy-mid)", color: "#fff" }}>
                      {d.escalation_level} — {d.user_name || d.user_id}
                    </span>
                  ))}
                  {doaContacts.length === 0 && (
                    <>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 4, background: "var(--navy-mid)", color: "#fff" }}>CIO — S. Narayanan</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 4, background: "var(--navy-mid)", color: "#fff" }}>COE Head — P. Verma</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 4, background: "var(--teal-m)", color: "#fff" }}>Procurement — S. Patel</span>
                    </>
                  )}
                  <button style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 4, border: "1px solid var(--bdr)", background: "none", cursor: "pointer" }}>+ Add DOA</button>
                </div>
                <div style={{ fontSize: 10, color: "var(--tx-q)", marginTop: 6 }}>Manage hierarchy in Masters &amp; Config → DOA Escalation.</div>
              </div>
            </div>
          </div>

          {/* Step 6: Source & Usage Config */}
          <div style={{ border: "1px solid var(--bdr)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ background: "var(--surf)", padding: "12px 16px", borderBottom: "1px solid var(--bdr)" }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Step 6 — Source &amp; Usage Config</div>
              <div style={{ fontSize: 11, color: "var(--tx-q)", marginTop: 2 }}>Applies to all line items from this contract</div>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Discovery Source <span style={{ color: "var(--red-m)" }}>*</span></label>
                  <select className="fi2" style={{ width: "100%" }} value={discoverySourceId} onChange={e => setDiscoverySourceId(e.target.value)}>
                    <option value="">Select source…</option>
                    {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <div style={{ fontSize: 10, color: "var(--tx-q)", marginTop: 3 }}>From Masters → Discovery Sources</div>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Usage Update Method <span style={{ color: "var(--red-m)" }}>*</span></label>
                  <select className="fi2" style={{ width: "100%" }} value={usageMethodId} onChange={e => setUsageMethodId(e.target.value)}>
                    <option value="">Select method…</option>
                    {methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <div style={{ fontSize: 10, color: "var(--tx-q)", marginTop: 3 }}>From Masters → Usage Update Methods</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Step 7: Review & Publish ─────────────────────────────────────── */}
      <div style={{ border: "2px solid var(--navy-mid)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ background: "var(--navy-mid)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: "#fff" }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Step 7 — Review &amp; Publish</div>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>
            {totalItems} software titles · {totalItems} entitlements · {newCount} new catalog {newCount === 1 ? "entry" : "entries"} · Updates in real time as you edit Step 3
          </div>
        </div>
        <div style={{ padding: 20 }}>
          {/* Summary stat line */}
          <div style={{ fontSize: 12, color: "var(--tx-m)", marginBottom: 14 }}>
            Line items: <strong>{totalItems}</strong>
            {" · "}SW_IDs — update existing: <span style={{ color: "var(--green-m)", fontWeight: 600 }}>{existingCount}</span>
            {" · "}New catalog entries: <span style={{ color: "var(--amber-m)", fontWeight: 600 }}>{newCount}</span>
          </div>

          {/* Review table */}
          <div style={{ border: "1px solid var(--bdr)", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--surf)" }}>
                  {["#","CONTRACT SOFTWARE NAME","CANONICAL NAME","SW_ID","ENT_ID","METRIC","SEATS","ANNUAL COST (₹)","CATALOG ACTION"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "var(--tx-q)", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "2px solid var(--bdr)", textAlign: h === "#" || h === "SEATS" || h === "ANNUAL COST (₹)" ? "center" : "left", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, idx) => {
                  const metricName = metrics.find(m => m.id === item.metricId)?.name;
                  return (
                    <tr key={item.id} style={{ borderBottom: "1px solid var(--bdr)" }}>
                      <td style={{ padding: "9px 12px", textAlign: "center", fontSize: 12 }}>{idx + 1}</td>
                      <td style={{ padding: "9px 12px", fontSize: 12 }}>{item.contractName || <span style={{ color: "var(--tx-q)", fontStyle: "italic" }}>—</span>}</td>
                      <td style={{ padding: "9px 12px", fontSize: 12, fontWeight: 600 }}>{item.canonicalName || <span style={{ color: "var(--tx-q)" }}>—</span>}</td>
                      <td style={{ padding: "9px 12px" }}>{item.swId ? <code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{item.swId}</code> : <span style={{ fontSize: 11, color: "var(--tx-q)" }}>(auto)</span>}</td>
                      <td style={{ padding: "9px 12px" }}><code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>ENT-{String(idx+1).padStart(3,"0")}</code></td>
                      <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--tx-m)" }}>{metricName || "—"}</td>
                      <td style={{ padding: "9px 12px", fontSize: 12, textAlign: "center" }}>{item.entitledCount ? Number(item.entitledCount).toLocaleString() : "—"}</td>
                      <td style={{ padding: "9px 12px", fontSize: 12, textAlign: "center" }}>{item.annualCostInr ? fmtINR(item.annualCostInr) : "—"}</td>
                      <td style={{ padding: "9px 12px" }}>
                        {item.canonicalName
                          ? item.isExisting
                            ? <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 3, background: "var(--green-l)", color: "var(--green-m)" }}>Update existing</span>
                            : <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 3, background: "var(--amber-l)", color: "var(--amber-m)" }}>⚠ New catalog entry</span>
                          : <span style={{ fontSize: 11, color: "var(--tx-q)" }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Amber warning */}
          {amberCount > 0 && (
            <div style={{ background: "var(--amber-l)", border: "1px solid var(--amber-m)", borderRadius: 6, padding: "10px 14px", fontSize: 12, color: "var(--amber-m)", marginBottom: 16 }}>
              ⚠ {amberCount * 2} amber fields still need input:
              {lineItems.filter(l => l.aiEntitled && !l.entitledCount).map(l => ` Line Item ${lineItems.indexOf(l) + 1} — Seats`).join(" and")}.
              Save Draft and complete, or publish the {lineItems.filter(l => l.contractName && l.canonicalName && l.entitledCount).length} ready items now.
            </div>
          )}

          {publishError && (
            <div style={{ background: "#fff0f0", border: "1px solid var(--red-m)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--red-m)", marginBottom: 14 }}>{publishError}</div>
          )}

          {/* Publish buttons */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn btn-p" style={{ background: "var(--navy-mid)" }} disabled={publishing} onClick={() => handlePublish(false)}>
              {publishing ? "Publishing…" : `Publish All (${totalItems} items) →`}
            </button>
            {amberCount > 0 && (
              <button className="btn btn-p" style={{ background: "var(--green-m)" }} disabled={publishing} onClick={() => handlePublish(true)}>
                {`Publish Ready Items (${lineItems.filter(l => l.contractName && l.canonicalName && l.entitledCount).length}) →`}
              </button>
            )}
            <button className="btn btn-o btn-sm">💾 Save Draft</button>
            <div style={{ fontSize: 11, color: "var(--tx-q)", marginLeft: 4 }}>Removes item from Step 3 → summary updates instantly · Previous contract archived to S3 on publish</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page Entry ────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [mode, setMode] = useState(null);
  if (mode === "manual") return <ManualFlow onBack={() => setMode(null)} />;
  if (mode === "bulk")   return <BulkUploadFlow onBack={() => setMode(null)} />;
  return <MethodSelection onSelect={setMode} />;
}
