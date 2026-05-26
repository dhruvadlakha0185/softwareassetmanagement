import { useState, useEffect, useRef } from "react";
import {
  extractContract, multiPublish,
  downloadBulkTemplate, bulkOnboard,
} from "../../api/onboarding";
import { fetchCatalogBrief } from "../../api/catalog";
import { fetchAllMasters } from "../../api/masters";
import { fetchOwners, fetchDOA } from "../../api/owners";

// ── Helpers ───────────────────────────────────────────────────────────────────
function newItem(idx) {
  return {
    id: `item-${Date.now()}-${idx}`,
    contractName: "", primarySwName: "", swId: "",
    isExisting: false, isAiDetected: false,
    deployment: "cloud", regions: [], businessUnits: [], notes: "",
    licenseTypeId: "", metricId: "",
    entitledCount: "", unitCost: "", annualCost: "",
    gxpFlag: "no", aliasInput: "", aliases: [],
    categoryId: "", subCategoryId: "", vendorRisk: "LOW",
    aiEntitled: null,
    priceSchedule: [],
  };
}

const DRL_REGIONS = ["Global", "EM", "EUG", "NAG", "GG India", "CIS", "RU"];

function buildYearRows(startDate, endDate, existingSchedule = []) {
  if (!startDate || !endDate) return [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const numYears = Math.ceil((end - start) / (1000 * 60 * 60 * 24 * 365));
  if (numYears <= 1) return [];

  return Array.from({ length: numYears }, (_, i) => {
    const yr = i + 1;
    const fromD = new Date(start);
    fromD.setFullYear(fromD.getFullYear() + i);
    const toD = new Date(start);
    toD.setFullYear(toD.getFullYear() + yr);
    toD.setDate(toD.getDate() - 1);
    const from = fromD.toISOString().split("T")[0];
    const to = toD.toISOString().split("T")[0];
    const existing = existingSchedule.find(r => r.year === yr);
    return existing
      ? { ...existing, from, to }
      : { year: yr, from, to, seats: "", unitCost: "", annualCost: "" };
  });
}

function isToday(from, to) {
  const today = new Date().toISOString().split("T")[0];
  return from <= today && today <= to;
}

const CURRENCY_SYMBOLS = {
  INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥",
  CHF: "CHF", AUD: "A$", CAD: "C$", SGD: "S$", AED: "AED",
  CNY: "¥", HKD: "HK$", SEK: "kr", NOK: "kr", DKK: "kr",
  NZD: "NZ$", MXN: "$", BRL: "R$", KRW: "₩", ZAR: "R",
  THB: "฿", MYR: "RM", IDR: "Rp", PHP: "₱", SAR: "﷼",
  QAR: "﷼", KWD: "KD", BHD: "BD", OMR: "﷼", EGP: "£",
  PKR: "₨", BDT: "৳",
};

function currencySymbol(code) {
  return CURRENCY_SYMBOLS[code] || code || "₹";
}

function fmtCost(n, currency = "INR") {
  if (!n) return "";
  const v = parseInt(n);
  if (isNaN(v)) return "";
  const sym = currencySymbol(currency);
  if (currency === "INR") {
    if (v >= 10_000_000) return `${sym}${(v / 10_000_000).toFixed(2)} Cr`;
    if (v >= 100_000)    return `${sym}${(v / 100_000).toFixed(0)}L`;
    return `${sym}${v.toLocaleString("en-IN")}`;
  }
  return `${sym}${v.toLocaleString()}`;
}


// ── Stepper ───────────────────────────────────────────────────────────────────
const STEPS = ["Upload Contract","AI Extraction","Line Items","Owner & DOA","Source Config","Review & Publish"];

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

// ── License Type searchable dropdown (dynamic — populated from /masters/all) ──
function LicenseTypeField({ value, onChange, options = [], hasError = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const searchRef = useRef(null);

  const filtered = options.filter(lt =>
    !search || (lt.license_type || "").toLowerCase().includes(search.toLowerCase())
  );
  const selected = options.find(lt => lt.id === value);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  const label = selected && selected.license_type
    ? selected.license_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Select…";

  return (
    <div ref={ref}>
      <label style={{ fontSize: 11, fontWeight: 600, color: hasError ? "var(--amber-m)" : "var(--tx-q)", display: "block", marginBottom: 4 }}>License Type <span style={{ color: "var(--red-m)" }}>*</span></label>
      <div style={{ position: "relative" }}>
        <button type="button" className="fi2"
          style={{ width: "100%", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderColor: hasError ? "var(--amber-m)" : undefined }}
          onClick={() => { setOpen(o => !o); setSearch(""); }}
        >
          <span style={{ color: selected ? "var(--tx)" : "var(--tx-q)" }}>{label}</span>
          <span style={{ fontSize: 10, color: "var(--tx-q)", flexShrink: 0, marginLeft: 8 }}>{open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--card)", border: "1px solid var(--bdr)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 60 }}>
            <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--bdr)" }}>
              <input ref={searchRef} placeholder="Search license type…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: "100%", border: "1px solid var(--bdr)", borderRadius: 4, padding: "4px 8px", fontSize: 12, outline: "none" }} />
            </div>
            <div style={{ maxHeight: 200, overflowY: "auto", padding: "4px 0" }}>
              {filtered.length === 0 && (
                <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--tx-q)" }}>No types found</div>
              )}
              {filtered.map(lt => {
                const displayLabel = lt.license_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                return (
                  <div key={lt.id}
                    onClick={() => { onChange(lt.id); setOpen(false); setSearch(""); }}
                    style={{ padding: "7px 14px", cursor: "pointer", fontSize: 12.5, color: "var(--tx)",
                      background: value === lt.id ? "var(--navy-xlt)" : undefined,
                      fontWeight: value === lt.id ? 600 : 400 }}
                    onMouseEnter={e => { if (value !== lt.id) e.currentTarget.style.background = "var(--surf)"; }}
                    onMouseLeave={e => { if (value !== lt.id) e.currentTarget.style.background = ""; }}
                  >{displayLabel}</div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Generic searchable select (for category / sub-category) ───────────────────
function SearchableSelect({ label, value, onChange, options, placeholder = "Select…", disabled = false, hasError = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const searchRef = useRef(null);

  const filtered = options.filter(o =>
    !search || (o.name || "").toLowerCase().includes(search.toLowerCase())
  );
  const selected = options.find(o => o.id === value);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  if (disabled) {
    return (
      <div>
        {label && <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>{label}</label>}
        <div className="fi2" style={{ color: "var(--tx-q)", cursor: "not-allowed" }}>{placeholder}</div>
      </div>
    );
  }

  return (
    <div ref={ref}>
      {label && <label style={{ fontSize: 11, fontWeight: 600, color: hasError ? "var(--amber-m)" : "var(--tx-q)", display: "block", marginBottom: 4 }}>{label}</label>}
      <div style={{ position: "relative" }}>
        <button type="button" className="fi2"
          style={{ width: "100%", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderColor: hasError ? "var(--amber-m)" : undefined }}
          onClick={() => { setOpen(o => !o); setSearch(""); }}
        >
          <span style={{ color: selected ? "var(--tx-m)" : "var(--tx-q)" }}>{selected ? selected.name : placeholder}</span>
          <span style={{ fontSize: 10, color: "var(--tx-q)", flexShrink: 0, marginLeft: 8 }}>{open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--card)", border: "1px solid var(--bdr)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 60 }}>
            <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--bdr)" }}>
              <input ref={searchRef} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: "100%", border: "1px solid var(--bdr)", borderRadius: 4, padding: "4px 8px", fontSize: 12, outline: "none" }} />
            </div>
            <div style={{ maxHeight: 200, overflowY: "auto", padding: "4px 0" }}>
              {filtered.length === 0 && <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--tx-q)" }}>No matches</div>}
              {filtered.map(o => (
                <div key={o.id}
                  onClick={() => { onChange(o.id); setOpen(false); setSearch(""); }}
                  style={{ padding: "7px 14px", cursor: "pointer", fontSize: 12.5, color: "var(--tx)",
                    background: value === o.id ? "var(--navy-xlt)" : undefined,
                    fontWeight: value === o.id ? 600 : 400 }}
                  onMouseEnter={e => { if (value !== o.id) e.currentTarget.style.background = "var(--surf)"; }}
                  onMouseLeave={e => { if (value !== o.id) e.currentTarget.style.background = ""; }}
                >{o.name || "—"}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Multi-Year Pricing Schedule Table ─────────────────────────────────────────
function PriceScheduleTable({ rows, onChange, currency = "INR" }) {
  const sym = currencySymbol(currency);
  const [open, setOpen] = useState(true);
  if (!rows || rows.length === 0) return null;

  const handleCell = (yr, field, val) => {
    const updated = rows.map(r => {
      if (r.year !== yr) return r;
      const next = { ...r, [field]: val };
      if (field === "seats" || field === "unitCost") {
        const s = parseInt(field === "seats" ? val : r.seats) || 0;
        const u = parseInt(field === "unitCost" ? val : r.unitCost) || 0;
        next.annualCost = s && u ? String(s * u) : "";
      }
      return next;
    });
    onChange(updated);
  };

  return (
    <div style={{ marginTop: 12, border: "1px solid var(--bdr)", borderRadius: 8, overflow: "hidden" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "var(--surf)", cursor: "pointer", userSelect: "none" }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--navy-mid)" }}>Multi-Year Pricing Schedule</span>
        <span style={{ fontSize: 11, color: "var(--tx-q)" }}>{open ? "▲ Hide" : "▼ Show"}</span>
      </div>
      {open && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--surf)", borderBottom: "2px solid var(--bdr)" }}>
                {["Year", "From", "To", "Seats", `Unit Cost (${sym})`, `Annual Cost (${sym})`].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, fontSize: 10, color: "var(--tx-q)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const active = isToday(r.from, r.to);
                return (
                  <tr key={r.year} style={{ borderBottom: "1px solid var(--bdr)", borderLeft: active ? "3px solid var(--navy-mid)" : "3px solid transparent" }}>
                    <td style={{ padding: "6px 10px", fontWeight: 700, color: active ? "var(--navy-mid)" : "var(--tx)" }}>
                      Year {r.year}{active && <span style={{ fontSize: 9, background: "var(--navy-mid)", color: "#fff", borderRadius: 3, padding: "1px 5px", marginLeft: 5 }}>NOW</span>}
                    </td>
                    <td style={{ padding: "6px 10px", color: "var(--tx-m)", fontSize: 11 }}>{r.from}</td>
                    <td style={{ padding: "6px 10px", color: "var(--tx-m)", fontSize: 11 }}>{r.to}</td>
                    <td style={{ padding: "4px 6px" }}>
                      <input type="number" className="fi2" style={{ width: 80 }}
                        value={r.seats} onChange={e => handleCell(r.year, "seats", e.target.value)}
                        placeholder="e.g. 500" />
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      <input type="number" className="fi2" style={{ width: 90 }}
                        value={r.unitCost} onChange={e => handleCell(r.year, "unitCost", e.target.value)}
                        placeholder="e.g. 3600" />
                    </td>
                    <td style={{ padding: "6px 10px", color: "var(--tx-m)", fontWeight: 600 }}>
                      {r.annualCost ? fmtCost(r.annualCost, currency) : <span style={{ color: "var(--tx-q)" }}>auto</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Line Item Card ────────────────────────────────────────────────────────────
function LineItemCard({ item, idx, onChange, onRemove, catalogBrief, categories, metrics, licenseTypes, currency = "INR" }) {
  const subCats = categories.find(c => c.id === item.categoryId)?.sub_categories || [];
  // Only show error styling once the user has started filling the item
  const touched = Boolean(item.contractName || item.primarySwName);

  const handlePrimarySwName = (val) => {
    const match = catalogBrief.find(c =>
      (c.primary_sw_name || "").toLowerCase() === val.toLowerCase()
    );
    onChange({ ...item, primarySwName: val, swId: match ? match.sw_id : "", isExisting: !!match });
  };

  const handleEntitled = (val) => {
    const seats = parseInt(val) || 0;
    const cost  = parseInt(item.unitCost) || 0;
    const updatedSchedule = item.priceSchedule.length
      ? item.priceSchedule.map(r => r.year === 1
          ? { ...r, seats: val, annualCost: seats && cost ? String(seats * cost) : "" }
          : r)
      : item.priceSchedule;
    onChange({ ...item, entitledCount: val, annualCost: seats && cost ? String(seats * cost) : "", priceSchedule: updatedSchedule });
  };

  const handleUnit = (val) => {
    const seats = parseInt(item.entitledCount) || 0;
    const cost  = parseInt(val) || 0;
    const updatedSchedule = item.priceSchedule.length
      ? item.priceSchedule.map(r => r.year === 1
          ? { ...r, unitCost: val, annualCost: seats && cost ? String(seats * cost) : "" }
          : r)
      : item.priceSchedule;
    onChange({ ...item, unitCost: val, annualCost: seats && cost ? String(seats * cost) : "", priceSchedule: updatedSchedule });
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
        {!item.isExisting && item.primarySwName && (
          <div style={{ background: "#FFFBEB", border: "1px solid var(--amber-m)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--amber-m)", marginBottom: 14 }}>
            ⚠ No matching Primary Software Name found for "{item.primarySwName}". A new Software Catalog entry will be created. A new SW_ID will be auto-generated on publish.
          </div>
        )}

        {/* Row 1: Contract Name | Primary SW Name | SW_ID */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Contract Software Name <span style={{ color: "var(--red-m)" }}>*</span></label>
            <input className="fi2" style={{ width: "100%" }} value={item.contractName} onChange={e => onChange({ ...item, contractName: e.target.value })} placeholder="As written in the contract" />
            <div style={{ fontSize: 10, color: "var(--tx-q)", marginTop: 3 }}>As written in the contract / as reported by discovery tools</div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: !item.isExisting && item.primarySwName ? "var(--amber-m)" : "var(--tx-q)", display: "block", marginBottom: 4 }}>
              Primary Software Name <span style={{ color: "var(--red-m)" }}>*</span>
            </label>
            <input
              className="fi2"
              style={{ width: "100%", borderColor: !item.isExisting && item.primarySwName ? "var(--amber-m)" : undefined, background: !item.isExisting && item.primarySwName ? "#FFFBEB" : undefined }}
              list={`catalog-${item.id}`}
              value={item.primarySwName}
              onChange={e => handlePrimarySwName(e.target.value)}
              placeholder="Standardised platform name"
            />
            <datalist id={`catalog-${item.id}`}>
              {catalogBrief.map(c => <option key={c.sw_id} value={c.primary_sw_name} />)}
            </datalist>
            <div style={{ fontSize: 10, color: item.isExisting ? "var(--green-m)" : "var(--amber-m)", marginTop: 3 }}>
              {item.isExisting ? "Standardised platform name → links to catalog master" : item.primarySwName ? "This will create a NEW Software Catalog entry" : "Select or create primary name"}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>SW_ID <span style={{ color: "var(--red-m)" }}>*</span></label>
            <input className="fi2" style={{ width: "100%", background: "var(--surf)", color: "var(--tx-m)" }}
              value={item.swId || (!item.isExisting && item.primarySwName ? "(auto)" : "")}
              readOnly
              placeholder="Auto-assigned"
            />
            <div style={{ fontSize: 10, color: "var(--tx-q)", marginTop: 3 }}>
              {item.isExisting ? "Auto-assigned from Primary SW Name · New name = new SW_ID" : "Generated on publish · next available"}
            </div>
          </div>
        </div>

        {/* Row 2: License Type | Metric | ENT_ID */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <LicenseTypeField value={item.licenseTypeId} onChange={val => onChange({ ...item, licenseTypeId: val })} options={licenseTypes} hasError={touched && !item.licenseTypeId} />
          <SearchableSelect
            label={<>License Metric <span style={{ color: "var(--red-m)" }}>*</span></>}
            value={item.metricId}
            onChange={val => onChange({ ...item, metricId: val })}
            options={metrics}
            placeholder="Select metric…"
            hasError={touched && !item.metricId}
          />
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
            <label style={{ fontSize: 11, fontWeight: 600, color: touched && !item.unitCost ? "var(--amber-m)" : "var(--tx-q)", display: "block", marginBottom: 4 }}>Unit Cost ({currencySymbol(currency)}) <span style={{ color: "var(--red-m)" }}>*</span></label>
            <input className="fi2" style={{ width: "100%", borderColor: touched && !item.unitCost ? "var(--amber-m)" : undefined }} type="number" value={item.unitCost} onChange={e => handleUnit(e.target.value)} placeholder="e.g. 3,600" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Annual Cost ({currencySymbol(currency)})</label>
            <input className="fi2" style={{ width: "100%", background: "var(--surf)", color: "var(--tx-m)" }}
              value={item.annualCost ? fmtCost(item.annualCost, currency) : ""}
              readOnly placeholder="Auto = Seats × Unit Cost" />
          </div>
        </div>

        {/* Multi-Year Pricing Schedule */}
        {item.priceSchedule && item.priceSchedule.length > 0 && (
          <PriceScheduleTable
            rows={item.priceSchedule}
            onChange={rows => onChange({ ...item, priceSchedule: rows })}
            currency={currency}
          />
        )}

        {/* Row 4: Business Units | Regions | Deployment | GxP */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <MultiSearchSelect
            label={<>Business Units <span style={{ color: "var(--red-m)" }}>*</span></>}
            value={item.businessUnits}
            onChange={val => onChange({ ...item, businessUnits: val })}
            options={BIZ_UNITS}
            placeholder="Select units…"
            hasError={touched && !item.businessUnits.length}
          />
          <MultiSearchSelect
            label={<>Regions <span style={{ color: "var(--red-m)" }}>*</span></>}
            value={item.regions}
            onChange={val => onChange({ ...item, regions: val })}
            options={DRL_REGIONS}
            placeholder="Select regions…"
            hasError={touched && !item.regions.length}
          />
          <SearchableSelectSimple
            label={<>Deployment <span style={{ color: "var(--red-m)" }}>*</span></>}
            value={item.deployment}
            onChange={val => onChange({ ...item, deployment: val })}
            options={DEPLOYMENT_OPTIONS}
          />
          <SearchableSelectSimple
            label={<>GxP Relevant? <span style={{ color: "var(--red-m)" }}>*</span></>}
            value={item.gxpFlag === "no" ? "no" : "yes"}
            onChange={val => onChange({ ...item, gxpFlag: val === "yes" ? "yes_21cfr" : "no" })}
            options={GXP_OPTIONS}
          />
        </div>

        {/* Row 5: Notes / Business Description */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Notes / Business Description</label>
          <textarea className="fi2" rows={2} style={{ width: "100%", resize: "vertical" }}
            value={item.notes} onChange={e => onChange({ ...item, notes: e.target.value })}
            placeholder="Describe the purpose of this software, primary users, departments…" />
        </div>

        {/* New catalog entry — only Category, Sub-Category, Vendor Risk needed (Deployment/GxP already above) */}
        {!item.isExisting && item.primarySwName && (
          <div style={{ border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 14, background: "var(--surf)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>New Catalog Entry — Metadata Required</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <SearchableSelect
                label={<>Category <span style={{ color: "var(--red-m)" }}>*</span></>}
                value={item.categoryId}
                onChange={val => onChange({ ...item, categoryId: val, subCategoryId: "" })}
                options={categories}
                placeholder="Select category…"
              />
              <SearchableSelect
                label={<>Sub-Category <span style={{ color: "var(--red-m)" }}>*</span></>}
                value={item.subCategoryId}
                onChange={val => onChange({ ...item, subCategoryId: val })}
                options={subCats}
                placeholder={item.categoryId ? "Select sub-category…" : "Select category first"}
                disabled={!item.categoryId}
              />
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
              Other Contract Name Aliases → Same Primary SW Name ({item.swId || "auto"})
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

// ── Renewal Alert Intervals field ─────────────────────────────────────────────
const ALERT_OPTIONS = [365, 90, 60, 30, 15, 7, 1];

function RenewalAlertField({ meta, setMeta }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const toggle = (days) => {
    setMeta(m => ({
      ...m,
      renewalAlertDays: m.renewalAlertDays.includes(days)
        ? m.renewalAlertDays.filter(d => d !== days)
        : [...m.renewalAlertDays, days],
    }));
  };

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const sorted = [...meta.renewalAlertDays].sort((a, b) => b - a);

  return (
    <div style={{ marginBottom: 0 }} ref={ref}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>
        Renewal Alert Intervals
        <span style={{ fontWeight: 400, color: "var(--tx-q)", marginLeft: 6 }}>— days before expiry</span>
      </label>
      <div style={{ position: "relative" }}>
        <button
          type="button"
          className="fi2"
          style={{ width: "100%", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          onClick={() => setOpen(o => !o)}
        >
          <span style={{ color: sorted.length ? "var(--tx-m)" : "var(--tx-q)" }}>
            {sorted.length > 0 ? `${sorted.join(", ")} days` : "No intervals selected"}
          </span>
          <span style={{ fontSize: 10, color: "var(--tx-q)", flexShrink: 0, marginLeft: 8 }}>{open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
            background: "var(--card)", border: "1px solid var(--bdr)",
            borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
            zIndex: 50, padding: "8px 0",
          }}>
            {ALERT_OPTIONS.map(days => (
              <label
                key={days}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={meta.renewalAlertDays.includes(days)}
                  onChange={() => toggle(days)}
                  style={{ accentColor: "var(--navy)", cursor: "pointer" }}
                />
                <span style={{ fontSize: 12.5, color: "var(--tx)" }}>
                  {days} {days === 1 ? "day" : "days"}
                  {days === 365 && <span style={{ fontSize: 10, color: "var(--blue-m)", marginLeft: 6 }}>— annual early alert</span>}
                </span>
              </label>
            ))}
            <div style={{ fontSize: 11, color: "var(--tx-q)", padding: "6px 14px 4px", borderTop: "1px solid var(--bdr)", marginTop: 4 }}>
              Alerts fire on exact days before contract expiry. Uncheck to disable.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Currency field ────────────────────────────────────────────────────────────
const CURRENCIES = [
  { code: "INR", name: "Indian Rupee" },
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound Sterling" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "AED", name: "UAE Dirham" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "DKK", name: "Danish Krone" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "KRW", name: "South Korean Won" },
  { code: "ZAR", name: "South African Rand" },
  { code: "THB", name: "Thai Baht" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "QAR", name: "Qatari Riyal" },
  { code: "KWD", name: "Kuwaiti Dinar" },
  { code: "BHD", name: "Bahraini Dinar" },
  { code: "OMR", name: "Omani Rial" },
  { code: "EGP", name: "Egyptian Pound" },
  { code: "PKR", name: "Pakistani Rupee" },
  { code: "BDT", name: "Bangladeshi Taka" },
  { code: "LKR", name: "Sri Lankan Rupee" },
  { code: "NPR", name: "Nepalese Rupee" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "RUB", name: "Russian Ruble" },
  { code: "PLN", name: "Polish Zloty" },
  { code: "CZK", name: "Czech Koruna" },
  { code: "HUF", name: "Hungarian Forint" },
  { code: "RON", name: "Romanian Leu" },
  { code: "ILS", name: "Israeli New Shekel" },
  { code: "CLP", name: "Chilean Peso" },
  { code: "COP", name: "Colombian Peso" },
  { code: "PEN", name: "Peruvian Sol" },
  { code: "ARS", name: "Argentine Peso" },
  { code: "TWD", name: "New Taiwan Dollar" },
  { code: "VND", name: "Vietnamese Dong" },
  { code: "NGN", name: "Nigerian Naira" },
  { code: "KES", name: "Kenyan Shilling" },
];

function CurrencyField({ meta, setMeta }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const searchRef = useRef(null);

  const filtered = CURRENCIES.filter(c =>
    !search ||
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const selected = CURRENCIES.find(c => c.code === meta.currency);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  return (
    <div ref={ref}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>
        Currency
      </label>
      <div style={{ position: "relative" }}>
        <button
          type="button"
          className="fi2"
          style={{ width: "100%", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          onClick={() => { setOpen(o => !o); setSearch(""); }}
        >
          <span style={{ color: "var(--tx-m)" }}>
            {selected ? `${selected.code} — ${selected.name}` : "Select currency…"}
          </span>
          <span style={{ fontSize: 10, color: "var(--tx-q)", flexShrink: 0, marginLeft: 8 }}>{open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
            background: "var(--card)", border: "1px solid var(--bdr)",
            borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
            zIndex: 50,
          }}>
            <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--bdr)" }}>
              <input
                ref={searchRef}
                placeholder="Search currency…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: "100%", border: "1px solid var(--bdr)", borderRadius: 4, padding: "4px 8px", fontSize: 12, outline: "none" }}
              />
            </div>
            <div style={{ maxHeight: 200, overflowY: "auto", padding: "4px 0" }}>
              {filtered.map(c => (
                <div
                  key={c.code}
                  onClick={() => { setMeta(m => ({ ...m, currency: c.code })); setOpen(false); setSearch(""); }}
                  style={{
                    padding: "7px 14px", cursor: "pointer", fontSize: 12.5, color: "var(--tx)",
                    background: meta.currency === c.code ? "var(--navy-xlt)" : undefined,
                    fontWeight: meta.currency === c.code ? 600 : 400,
                  }}
                  onMouseEnter={e => { if (meta.currency !== c.code) e.currentTarget.style.background = "var(--surf)"; }}
                  onMouseLeave={e => { if (meta.currency !== c.code) e.currentTarget.style.background = ""; }}
                >
                  <span style={{ fontWeight: 600, marginRight: 8 }}>{c.code}</span>{c.name}
                </div>
              ))}
              {filtered.length === 0 && (
                <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--tx-q)" }}>No matching currencies</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Business Units options ────────────────────────────────────────────────────
const BIZ_UNITS = [
  "All departments", "Finance", "Commercial", "Management", "SCM",
  "Manufacturing", "QA/QC", "Regulatory", "R&D", "QC Labs",
  "Analytical Dev", "Engineering", "Regulatory Affairs", "Drug Safety",
  "Marketing", "Medical", "IT", "IT Security", "SOC",
  "Procurement", "HR", "Training",
];

// ── Searchable multi-select (string arrays — Business Units, Regions) ─────────
function MultiSearchSelect({ label, value = [], onChange, options = [], placeholder = "Select…", hasError = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const searchRef = useRef(null);

  const filtered = options.filter(o =>
    !search || o.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  const toggle = (opt) => {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt]);
  };

  const displayText = value.length === 0
    ? placeholder
    : value.length <= 2 ? value.join(", ") : `${value.slice(0, 2).join(", ")} +${value.length - 2} more`;

  return (
    <div ref={ref}>
      {label && <label style={{ fontSize: 11, fontWeight: 600, color: hasError ? "var(--amber-m)" : "var(--tx-q)", display: "block", marginBottom: 4 }}>{label}</label>}
      <div style={{ position: "relative" }}>
        <button type="button" className="fi2"
          style={{ width: "100%", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderColor: hasError ? "var(--amber-m)" : undefined }}
          onClick={() => { setOpen(o => !o); setSearch(""); }}
        >
          <span style={{ color: value.length ? "var(--tx-m)" : "var(--tx-q)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayText}</span>
          <span style={{ fontSize: 10, color: "var(--tx-q)", flexShrink: 0, marginLeft: 6, display: "flex", alignItems: "center", gap: 4 }}>
            {value.length > 0 && <span style={{ background: "var(--navy-mid)", color: "#fff", borderRadius: 8, padding: "0 5px", fontSize: 10 }}>{value.length}</span>}
            {open ? "▲" : "▼"}
          </span>
        </button>
        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--card)", border: "1px solid var(--bdr)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 60 }}>
            <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--bdr)" }}>
              <input ref={searchRef} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: "100%", border: "1px solid var(--bdr)", borderRadius: 4, padding: "4px 8px", fontSize: 12, outline: "none" }} />
            </div>
            <div style={{ maxHeight: 200, overflowY: "auto", padding: "4px 0" }}>
              {filtered.length === 0 && <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--tx-q)" }}>No matches</div>}
              {filtered.map(opt => (
                <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer" }}>
                  <input type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)} style={{ accentColor: "var(--navy-mid)", cursor: "pointer" }} />
                  <span style={{ fontSize: 12.5, color: "var(--tx)" }}>{opt}</span>
                </label>
              ))}
            </div>
            {value.length > 0 && (
              <div style={{ padding: "6px 12px", borderTop: "1px solid var(--bdr)" }}>
                <button type="button" onClick={() => onChange([])} style={{ fontSize: 11, color: "var(--red-m)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Clear all</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Searchable single-select (string value/label pairs — Deployment, GxP) ─────
function SearchableSelectSimple({ label, value, onChange, options = [], placeholder = "Select…" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const searchRef = useRef(null);

  const filtered = options.filter(o =>
    !search || o.label.toLowerCase().includes(search.toLowerCase())
  );
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  return (
    <div ref={ref}>
      {label && <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>{label}</label>}
      <div style={{ position: "relative" }}>
        <button type="button" className="fi2"
          style={{ width: "100%", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          onClick={() => { setOpen(o => !o); setSearch(""); }}
        >
          <span style={{ color: selected ? "var(--tx-m)" : "var(--tx-q)" }}>{selected ? selected.label : placeholder}</span>
          <span style={{ fontSize: 10, color: "var(--tx-q)", flexShrink: 0, marginLeft: 8 }}>{open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--card)", border: "1px solid var(--bdr)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 60 }}>
            <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--bdr)" }}>
              <input ref={searchRef} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: "100%", border: "1px solid var(--bdr)", borderRadius: 4, padding: "4px 8px", fontSize: 12, outline: "none" }} />
            </div>
            <div style={{ maxHeight: 160, overflowY: "auto", padding: "4px 0" }}>
              {filtered.length === 0 && <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--tx-q)" }}>No matches</div>}
              {filtered.map(o => (
                <div key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false); setSearch(""); }}
                  style={{ padding: "7px 14px", cursor: "pointer", fontSize: 12.5, color: "var(--tx)",
                    background: value === o.value ? "var(--navy-xlt)" : undefined,
                    fontWeight: value === o.value ? 600 : 400 }}
                  onMouseEnter={e => { if (value !== o.value) e.currentTarget.style.background = "var(--surf)"; }}
                  onMouseLeave={e => { if (value !== o.value) e.currentTarget.style.background = ""; }}
                >{o.label}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── DOA picker — searchable add/remove from registered contacts ───────────────
function DOAPickerField({ contacts, selectedIds, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const searchRef = useRef(null);

  const selected = contacts.filter(d => selectedIds.includes(d.id));
  const available = contacts.filter(d => !selectedIds.includes(d.id));
  const filtered = available.filter(d =>
    !search ||
    (d.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (d.role_label || "").toLowerCase().includes(search.toLowerCase()) ||
    (d.business_unit || "").toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 6 }}>DOA Escalation Contacts</label>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {selected.map(d => (
            <span key={d.id} style={{ fontSize: 11, fontWeight: 600, background: "var(--navy-mid)", color: "#fff", borderRadius: 4, padding: "3px 6px 3px 10px", display: "flex", alignItems: "center", gap: 6 }}>
              <span>{d.full_name}{d.role_label ? ` — ${d.role_label}` : ""}</span>
              <button type="button" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}
                onClick={() => onChange(selectedIds.filter(i => i !== d.id))}>×</button>
            </span>
          ))}
        </div>
      )}
      <div ref={ref} style={{ position: "relative" }}>
        <button type="button"
          style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 4, border: "1px solid var(--bdr)", background: "none", color: available.length === 0 ? "var(--tx-q)" : "var(--tx-m)", cursor: available.length === 0 ? "default" : "pointer" }}
          onClick={() => { if (available.length) { setOpen(o => !o); setSearch(""); } }}
        >
          + Add DOA Contact
        </button>
        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, minWidth: 280, background: "var(--card)", border: "1px solid var(--bdr)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 200 }}>
            <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--bdr)" }}>
              <input ref={searchRef} placeholder="Search name, role, BU…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: "100%", border: "1px solid var(--bdr)", borderRadius: 4, padding: "4px 8px", fontSize: 12, outline: "none" }} />
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto", padding: "4px 0" }}>
              {filtered.length === 0 && (
                <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--tx-q)" }}>
                  {available.length === 0 ? "All contacts already added" : "No matches"}
                </div>
              )}
              {filtered.map(d => (
                <div key={d.id}
                  onClick={() => { onChange([...selectedIds, d.id]); setOpen(false); setSearch(""); }}
                  style={{ padding: "8px 14px", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surf)"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--tx)" }}>{d.full_name}</div>
                  <div style={{ fontSize: 11, color: "var(--tx-q)", marginTop: 1 }}>
                    {[d.role_label, d.business_unit].filter(Boolean).join(" · ")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div style={{ fontSize: 10, color: "var(--tx-q)", marginTop: 6 }}>Configure contacts in App Owners → DOA Contacts</div>
    </div>
  );
}

const DEPLOYMENT_OPTIONS = [
  { value: "cloud", label: "Cloud" },
  { value: "on_premise", label: "On-Premise" },
  { value: "desktop_cloud", label: "Desktop/Cloud" },
  { value: "hybrid", label: "Hybrid" },
];

const GXP_OPTIONS = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
];

// ── Manual Flow ───────────────────────────────────────────────────────────────
function ManualFlow({ onBack }) {
  const [file, setFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [extractError, setExtractError] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState(null);
  const [fileSize, setFileSize] = useState(null);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  // Step 1-2: Contract header
  const [meta, setMeta] = useState({ vendorName: "", reseller: "", poNumber: "", clmId: "", startDate: "", endDate: "", totalValue: "", autoRenewal: "", renewalAlertDays: [90, 60, 30, 15, 7, 1], currency: "INR" });
  const [dateError, setDateError] = useState("");

  // Step 3: Line items
  const [lineItems, setLineItems] = useState([newItem(0)]);

  // Step 4 (merged into line items) — Steps 5-6:
  const [appOwnerId, setAppOwnerId] = useState("");
  const [secondaryOwnerId, setSecondaryOwnerId] = useState("");
  const [selectedDoaIds, setSelectedDoaIds] = useState([]);
  const [discoverySourceId, setDiscoverySourceId] = useState("");
  const [usageMethodId, setUsageMethodId] = useState("");

  // Masters
  const [categories, setCategories] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [sources, setSources] = useState([]);
  const [methods, setMethods] = useState([]);
  const [licenseTypes, setLicenseTypes] = useState([]);
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
    fetchAllMasters().then(masters => {
      setCategories(masters.categories || []);
      setMetrics(masters.metrics || []);
      setSources(masters.discovery_sources || []);
      setMethods(masters.usage_methods || []);
      setLicenseTypes(masters.license_types || []);
    }).catch(() => {});
    fetchOwners().then(list => setOwners(list || [])).catch(() => {});
    fetchCatalogBrief().then(brief => setCatalogBrief(brief || [])).catch(() => {});
    fetchDOA().then(doa => setDoaContacts(doa || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!meta.startDate || !meta.endDate) return;
    setLineItems(ls => ls.map(item => {
      const rows = buildYearRows(meta.startDate, meta.endDate, item.priceSchedule);
      if (rows.length === 0) return { ...item, priceSchedule: [] };
      const filled = rows.map((r, i) => ({
        ...r,
        seats: r.seats || (i === 0 ? item.entitledCount : (rows[i - 1]?.seats || item.entitledCount)),
        unitCost: r.unitCost || (i === 0 ? item.unitCost : (rows[i - 1]?.unitCost || item.unitCost)),
        annualCost: r.annualCost || "",
      }));
      return { ...item, priceSchedule: filled };
    }));
  }, [meta.startDate, meta.endDate]);

  useEffect(() => {
    if (!extracted) return;
    setMeta(prev => ({
      ...prev,
      vendorName: extracted.vendor_name || "",
      reseller: extracted.reseller || "",
      poNumber: extracted.po_number || "",
      clmId: extracted.clm_id || "",
      startDate: extracted.start_date || "",
      endDate: extracted.end_date || "",
      totalValue: extracted.total_value_inr ?? "",
      autoRenewal: extracted.auto_renewal_clause || "",
    }));
    if (extracted.line_items?.length) {
      setLineItems(extracted.line_items.map((li, i) => {
        const match = catalogBrief.find(c =>
          (c.primary_sw_name || "").toLowerCase() === (li.contract_name || "").toLowerCase()
        );
        // Map license_type string from AI → UUID from licenseTypes table
        const ltMatch = licenseTypes.find(lt =>
          lt.license_type === (li.license_type || "").toLowerCase()
        );
        return {
          ...newItem(i),
          contractName: li.contract_name || "",
          primarySwName: match ? match.primary_sw_name : (li.contract_name || ""),
          swId: match ? match.sw_id : "",
          isExisting: !!match,
          isAiDetected: true,
          licenseTypeId: ltMatch ? ltMatch.id : "",
          entitledCount: li.entitled_count ?? "",
          unitCost: li.unit_cost ?? "",
          annualCost: li.annual_cost ?? "",
          aiEntitled: li.entitled_count || null,
        };
      }));
    }
  }, [extracted, catalogBrief, licenseTypes]);

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
  const addItem = () => setLineItems(ls => {
    const item = newItem(ls.length);
    const rows = buildYearRows(meta.startDate, meta.endDate);
    if (rows.length > 0) {
      item.priceSchedule = rows;
    }
    return [...ls, item];
  });

  const isItemComplete = (l) =>
    l.contractName && l.primarySwName && l.licenseTypeId && l.metricId &&
    l.entitledCount && l.unitCost && l.businessUnits.length > 0 && l.regions.length > 0;

  // Summary stats
  const totalItems = lineItems.length;
  const existingCount = lineItems.filter(l => l.isExisting).length;
  const newCount = lineItems.filter(l => !l.isExisting && l.primarySwName).length;
  const amberCount = lineItems.filter(l => !isItemComplete(l)).length;

  const autoFillCount = extracted
    ? Object.values(meta).filter(Boolean).length
    : 0;

  const handlePublish = async () => {
    setDateError("");
    if (!meta.startDate) { setDateError("Contract Start Date is required."); return; }
    if (!meta.endDate)   { setDateError("Contract End Date is required."); return; }
    if (meta.startDate >= meta.endDate) { setDateError("Contract End Date must be after Start Date."); return; }
    setPublishing(true); setPublishError("");
    try {
      const items = lineItems.filter(l => l.contractName && l.primarySwName);
      if (!items.length) { setPublishError("No valid line items to publish."); setPublishing(false); return; }
      const incomplete = items.filter(l => !isItemComplete(l));
      if (incomplete.length > 0) {
        const names = incomplete.map(l => `Item ${lineItems.indexOf(l) + 1}${l.contractName ? ` (${l.contractName})` : ""}`).join(", ");
        setPublishError(`Complete all mandatory fields (*) before publishing. Incomplete: ${names}.`);
        setPublishing(false); return;
      }

      const payload = {
        vendor_name: meta.vendorName || undefined,
        reseller: meta.reseller || undefined,
        po_number: meta.poNumber || undefined,
        clm_id: meta.clmId || undefined,
        start_date: meta.startDate || undefined,
        end_date: meta.endDate || undefined,
        total_value_inr: meta.totalValue ? parseInt(meta.totalValue) : undefined,
        auto_renewal_clause: meta.autoRenewal || undefined,
        renewal_alert_extra_days: meta.renewalAlertDays.length > 0 ? meta.renewalAlertDays : undefined,
        currency: meta.currency || undefined,
        app_owner_id: appOwnerId || undefined,
        secondary_owner_id: secondaryOwnerId || undefined,
        discovery_source_id: discoverySourceId || undefined,
        usage_method_id: usageMethodId || undefined,
        line_items: items.map(li => ({
          contract_name: li.contractName,
          primary_sw_name: li.primarySwName,
          sw_id: li.swId || undefined,
          license_type_id: li.licenseTypeId || undefined,
          metric_id: li.metricId || undefined,
          entitled_count: li.entitledCount ? parseInt(li.entitledCount) : undefined,
          unit_cost: li.unitCost ? parseInt(li.unitCost) : undefined,
          annual_cost: li.annualCost ? parseInt(li.annualCost) : undefined,
          deployment: li.deployment,
          regions: li.regions.length > 0 ? li.regions : undefined,
          business_units: li.businessUnits.length > 0 ? li.businessUnits : undefined,
          gxp_flag: li.gxpFlag,
          notes: li.notes || undefined,
          aliases: li.aliases,
          category_id: li.categoryId || undefined,
          sub_category_id: li.subCategoryId || undefined,
          vendor_risk: li.vendorRisk,
          price_schedule: (() => {
            const validRows = (li.priceSchedule || []).filter(r => r.seats && r.unitCost);
            if (validRows.length <= 1) return undefined;
            return validRows.map(r => ({
              year_number: r.year,
              effective_from: r.from,
              effective_to: r.to,
              entitled_count: parseInt(r.seats) || 0,
              unit_cost: parseInt(r.unitCost) || 0,
              annual_cost: parseInt(r.annualCost) || ((parseInt(r.seats) * parseInt(r.unitCost)) || 0),
            }));
          })(),
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
              <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, fontSize: 10, color: "var(--tx-q)", borderBottom: "2px solid var(--bdr)" }}>PRIMARY SW NAME</th>
              <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, fontSize: 10, color: "var(--tx-q)", borderBottom: "2px solid var(--bdr)" }}>SW_ID</th>
              <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, fontSize: 10, color: "var(--tx-q)", borderBottom: "2px solid var(--bdr)" }}>ENT_ID</th>
            </tr></thead>
            <tbody>{published.created.map((c, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--bdr)" }}>
                <td style={{ padding: "7px 10px" }}>{c.contract_name}</td>
                <td style={{ padding: "7px 10px", fontWeight: 600 }}>{c.primary_sw_name}</td>
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
      <div style={{ border: "1px solid var(--bdr)", borderRadius: 10, marginBottom: 20 }}>
        <div style={{ background: "var(--surf)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--bdr)", borderRadius: "10px 10px 0 0" }}>
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
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Contract Start Date <span style={{ color: "var(--red-m)" }}>*</span></label>
              <input className="fi2" style={{ width: "100%", borderColor: !meta.startDate ? "var(--amber-m)" : undefined }} type="date" value={meta.startDate} onChange={e => { setMeta(m => ({ ...m, startDate: e.target.value })); setDateError(""); }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Contract End Date <span style={{ color: "var(--red-m)" }}>*</span></label>
              <input className="fi2" style={{ width: "100%", borderColor: !meta.endDate ? "var(--amber-m)" : undefined }} type="date" value={meta.endDate} onChange={e => { setMeta(m => ({ ...m, endDate: e.target.value })); setDateError(""); }} />
            </div>
          </div>
          {dateError && (
            <div style={{ background: "var(--red-l)", border: "1px solid #F7C1C1", color: "var(--red-m)", borderRadius: 6, padding: "7px 12px", fontSize: 12, marginBottom: 12 }}>
              {dateError}
            </div>
          )}
          {/* Row A: Auto-Renewal + Renewal Alert Intervals */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ border: !meta.autoRenewal ? "1.5px solid var(--amber-m)" : "1px solid var(--bdr)", borderRadius: 6, padding: "10px 12px", background: !meta.autoRenewal ? "#FFFBEB" : "transparent" }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: !meta.autoRenewal ? "var(--amber-m)" : "var(--tx-q)", display: "block", marginBottom: 4 }}>
                Auto-Renewal Clause {!meta.autoRenewal && "⚠"}
              </label>
              <select className="fi2" style={{ width: "100%" }} value={meta.autoRenewal} onChange={e => setMeta(m => ({ ...m, autoRenewal: e.target.value }))}>
                <option value="">Select…</option>
                <option value="yes">Yes</option><option value="no">No</option><option value="opt_in">Opt-In</option>
              </select>
            </div>
            <RenewalAlertField meta={meta} setMeta={setMeta} />
          </div>

          {/* Row B: Currency + Total Contract Value */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <CurrencyField meta={meta} setMeta={setMeta} />
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", display: "block", marginBottom: 4 }}>Total Contract Value ({meta.currency || "INR"})</label>
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
            <div style={{ fontSize: 11, color: "var(--tx-q)", marginTop: 2 }}>Each line item = one Contract Software Name → one Primary Software Name → one SW_ID + one ENT_ID</div>
          </div>
          <button className="btn btn-p btn-sm" style={{ background: "var(--navy-mid)", whiteSpace: "nowrap" }} onClick={addItem}>+ Add Line Item</button>
        </div>
        <div style={{ padding: 20 }}>
          {/* How this works — collapsible */}
          <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, marginBottom: 16, fontSize: 12, color: "#1E40AF" }}>
            {/* Header row — always visible */}
            <div
              onClick={() => setHowItWorksOpen(o => !o)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", cursor: "pointer", userSelect: "none" }}
            >
              <span style={{ fontWeight: 700, fontSize: 12 }}>How this works — Contract Software Name vs. Primary Software Name</span>
              <span style={{ fontSize: 11, color: "#3B82F6", flexShrink: 0, marginLeft: 12 }}>{howItWorksOpen ? "▲ Hide" : "▼ Show"}</span>
            </div>
            {/* Collapsible body */}
            {howItWorksOpen && (
              <div style={{ padding: "0 16px 12px", lineHeight: 1.8, borderTop: "1px solid #BFDBFE" }}>
                <p style={{ margin: "10px 0 6px" }}>A single contract can cover multiple software products. For each product, enter the <strong>Contract Software Name</strong> exactly as it appears in the signed contract, then map it to a <strong>Primary Software Name</strong> — the standardised name used in the SAM catalog. Each line item gets its own <code style={{ fontSize: 11, background: "#DBEAFE", padding: "1px 4px", borderRadius: 3 }}>SW_ID</code> and <code style={{ fontSize: 11, background: "#DBEAFE", padding: "1px 4px", borderRadius: 3 }}>ENT_ID</code>.</p>
                <strong>Example — Microsoft EA:</strong>
                <table style={{ marginTop: 6, borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #BFDBFE" }}>
                      <th style={{ textAlign: "left", padding: "3px 10px 3px 0", fontWeight: 700, color: "#1E3A8A" }}>Contract Software Name</th>
                      <th style={{ textAlign: "left", padding: "3px 10px", fontWeight: 700, color: "#1E3A8A" }}>Primary Software Name</th>
                      <th style={{ textAlign: "left", padding: "3px 0", fontWeight: 700, color: "#1E3A8A" }}>SW_ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Microsoft 365 E3 — Enterprise Agreement", "Microsoft 365 E3", "MS-001"],
                      ["Microsoft 365 E5 — Enterprise Agreement", "Microsoft 365 E5", "MS-002"],
                      ["Microsoft Visio Plan 2", "Microsoft Visio", "MS-003"],
                      ["Power BI Pro — EA Addendum", "Microsoft Power BI Pro", "MS-004"],
                    ].map(([csn, psn, id]) => (
                      <tr key={id} style={{ borderBottom: "1px solid #DBEAFE" }}>
                        <td style={{ padding: "4px 10px 4px 0", color: "#1E40AF" }}>{csn}</td>
                        <td style={{ padding: "4px 10px", fontWeight: 600, color: "#1E3A8A" }}>{psn}</td>
                        <td style={{ padding: "4px 0" }}><code style={{ fontSize: 10, background: "#DBEAFE", padding: "1px 5px", borderRadius: 3 }}>{id}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 8, color: "#3B82F6" }}>All 4 line items share PO <code style={{ fontSize: 11, background: "#DBEAFE", padding: "1px 4px", borderRadius: 3 }}>{meta.poNumber || "EA-2026-MSFT-001"}</code> but each gets its own SW_ID and ENT_ID in the catalog.</div>
              </div>
            )}
          </div>
          {/* AI detection notice */}
          {extracted && lineItems.some(l => l.isAiDetected) && (
            <div style={{ background: "var(--green-l)", border: "1px solid var(--green-m)", borderRadius: 6, padding: "8px 14px", marginBottom: 16, fontSize: 12, color: "var(--green-m)", lineHeight: 1.6 }}>
              ✓ AI detected <strong>{lineItems.filter(l => l.isAiDetected).length} line item{lineItems.filter(l => l.isAiDetected).length !== 1 ? "s" : ""}</strong> in this contract. Review the mapping below — confirm or edit the Primary Software Name and SW_ID for each. Items with an existing SW_ID will update the catalog entry; new SW_IDs will create a new catalog entry.
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
              licenseTypes={licenseTypes}
              currency={meta.currency || "INR"}
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

      {/* ── Steps 4 (merged above) → Steps 5 + 6 side by side ─────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
          {/* Step 5: Owner & DOA */}
          <div style={{ border: "1px solid var(--bdr)", borderRadius: 10, flex: 1 }}>
            <div style={{ background: "var(--surf)", padding: "12px 16px", borderBottom: "1px solid var(--bdr)", borderRadius: "10px 10px 0 0" }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Step 4 — Owner &amp; DOA Escalation</div>
              <div style={{ fontSize: 11, color: "var(--tx-q)", marginTop: 2 }}>Applies to all line items unless individually overridden</div>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <SearchableSelect
                    label={<>Primary App Owner <span style={{ color: "var(--red-m)" }}>*</span></>}
                    value={appOwnerId}
                    onChange={setAppOwnerId}
                    options={owners.filter(o => o.is_active).map(o => ({ id: o.id, name: `${o.full_name}${o.bu ? ` (${o.bu})` : ""}` }))}
                    placeholder="Select from masters…"
                  />
                  <div style={{ fontSize: 10, color: "var(--tx-q)", marginTop: 3 }}>Populated from App Owner Master</div>
                </div>
                <div>
                  <SearchableSelect
                    label="Secondary Owner"
                    value={secondaryOwnerId}
                    onChange={setSecondaryOwnerId}
                    options={owners.filter(o => o.is_active && o.id !== appOwnerId).map(o => ({ id: o.id, name: o.full_name }))}
                    placeholder="Select from masters…"
                  />
                </div>
              </div>
              <DOAPickerField
                contacts={doaContacts}
                selectedIds={selectedDoaIds}
                onChange={setSelectedDoaIds}
              />
            </div>
          </div>

          {/* Step 6: Source & Usage Config */}
          <div style={{ border: "1px solid var(--bdr)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ background: "var(--surf)", padding: "12px 16px", borderBottom: "1px solid var(--bdr)" }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Step 5 — Source &amp; Usage Config</div>
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

      {/* ── Step 7: Review & Publish ─────────────────────────────────────── */}
      <div style={{ border: "2px solid var(--navy-mid)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ background: "var(--navy-mid)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: "#fff" }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Step 6 — Review &amp; Publish</div>
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
                      <td style={{ padding: "9px 12px", fontSize: 12, fontWeight: 600 }}>{item.primarySwName || <span style={{ color: "var(--tx-q)" }}>—</span>}</td>
                      <td style={{ padding: "9px 12px" }}>{item.swId ? <code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{item.swId}</code> : <span style={{ fontSize: 11, color: "var(--tx-q)" }}>(auto)</span>}</td>
                      <td style={{ padding: "9px 12px" }}><code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>ENT-{String(idx+1).padStart(3,"0")}</code></td>
                      <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--tx-m)" }}>{metricName || "—"}</td>
                      <td style={{ padding: "9px 12px", fontSize: 12, textAlign: "center" }}>{item.entitledCount ? Number(item.entitledCount).toLocaleString() : "—"}</td>
                      <td style={{ padding: "9px 12px", fontSize: 12, textAlign: "center" }}>{item.annualCost ? fmtCost(item.annualCost, meta.currency || "INR") : "—"}</td>
                      <td style={{ padding: "9px 12px" }}>
                        {item.primarySwName
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
              ⚠ {amberCount} line item{amberCount !== 1 ? "s" : ""} still have missing mandatory fields (highlighted in amber). Complete all fields marked <strong>*</strong> before publishing.
            </div>
          )}

          {publishError && (
            <div style={{ background: "#fff0f0", border: "1px solid var(--red-m)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--red-m)", marginBottom: 14 }}>{publishError}</div>
          )}

          {/* Publish buttons */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn btn-p" style={{ background: amberCount > 0 ? "var(--tx-q)" : "var(--navy-mid)", cursor: amberCount > 0 ? "not-allowed" : "pointer" }} disabled={publishing || amberCount > 0} onClick={handlePublish}>
              {publishing ? "Publishing…" : `Publish All (${totalItems} items) →`}
            </button>
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
