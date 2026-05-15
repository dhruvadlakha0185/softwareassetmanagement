import { useState, useEffect, useRef } from "react";
import {
  extractContract, publishOnboarding, downloadBulkTemplate, bulkOnboard,
} from "../../api/onboarding";
import { fetchCatalogBrief } from "../../api/catalog";
import { fetchAllMasters } from "../../api/masters";
import { fetchOwners } from "../../api/owners";

// ── Helpers ───────────────────────────────────────────────────────────────────
function SectionCard({ title, badge, children }) {
  return (
    <div style={{ border: "1px solid var(--bdr)", borderRadius: 10, marginBottom: 16, overflow: "hidden" }}>
      <div style={{ background: "var(--surf)", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--bdr)" }}>
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>{title}</span>
        {badge}
      </div>
      <div style={{ padding: "16px" }}>{children}</div>
    </div>
  );
}

function FieldRow({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>{children}</div>;
}

function Field({ label, required, amber, hint, children }) {
  return (
    <div style={{
      borderRadius: 6, padding: amber ? "10px 12px" : 0,
      border: amber ? "1.5px solid var(--amber-m)" : "none",
      background: amber ? "var(--amber-l)" : "transparent",
    }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: amber ? "var(--amber-m)" : "var(--tx-q)", letterSpacing: 0.3, display: "block", marginBottom: 5 }}>
        {label} {required && <span style={{ color: "var(--red-m)" }}>*</span>}
        {amber && <span style={{ marginLeft: 6, fontSize: 10 }}>⚠ Verify</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 10, color: amber ? "var(--amber-m)" : "var(--tx-q)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

// ── Stepper ───────────────────────────────────────────────────────────────────
const STEPS = ["Upload Contract", "AI Extraction", "SW Metadata", "License Details", "Owner & DOA", "Source Config", "Review & Publish"];

function Stepper({ current }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 20, flexShrink: 0 }}>
      {STEPS.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : 0 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: i < current ? "var(--green-m)" : i === current ? "var(--navy-mid)" : "var(--bdr)",
              color: i <= current ? "#fff" : "var(--tx-q)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              {i < current ? "✓" : i + 1}
            </div>
            <div style={{ fontSize: 9.5, color: i === current ? "var(--navy-mid)" : "var(--tx-q)", fontWeight: i === current ? 700 : 400, whiteSpace: "nowrap" }}>
              {s}
            </div>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{ flex: 1, height: 2, background: i < current ? "var(--green-m)" : "var(--bdr)", margin: "0 4px", marginBottom: 16 }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Method Selection ──────────────────────────────────────────────────────────
function MethodSelection({ onSelect }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)", overflow: "hidden", padding: "28px 32px 0" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: "var(--tx-q)", marginBottom: 4 }}>SAM Platform <span style={{ color: "var(--tx-m)" }}>›</span> Onboard Software</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Onboard New Software / License</h1>
        <p style={{ fontSize: 13, color: "var(--tx-m)" }}>Choose how you want to onboard software licenses into the SAM platform.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 820 }}>

        {/* Manual */}
        <div style={{ border: "2px solid var(--bdr)", borderRadius: 12, padding: 28, cursor: "pointer", transition: "border-color 0.15s" }}
          onClick={() => onSelect("manual")}
          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--navy-mid)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--bdr)"}
        >
          <div style={{ fontSize: 28, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Manual Onboarding</div>
          <div style={{ fontSize: 13, color: "var(--tx-m)", lineHeight: 1.7, marginBottom: 20 }}>
            Upload a signed contract and let AI extract key terms. Fill in software metadata, owner details, and source configuration in a guided two-panel form.
          </div>
          <ul style={{ fontSize: 12, color: "var(--tx-m)", paddingLeft: 16, lineHeight: 2, marginBottom: 20 }}>
            <li>AI extraction from PDF/DOCX contract</li>
            <li>One software entry at a time</li>
            <li>Full metadata + owner + source config</li>
          </ul>
          <button className="btn btn-p btn-sm" style={{ background: "var(--navy-mid)" }} onClick={e => { e.stopPropagation(); onSelect("manual"); }}>
            Start Manual →
          </button>
        </div>

        {/* Bulk Upload */}
        <div style={{ border: "2px solid var(--bdr)", borderRadius: 12, padding: 28, cursor: "pointer", transition: "border-color 0.15s" }}
          onClick={() => onSelect("bulk")}
          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--teal-m)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--bdr)"}
        >
          <div style={{ fontSize: 28, marginBottom: 12 }}>📥</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Bulk Upload via Template</div>
          <div style={{ fontSize: 13, color: "var(--tx-m)", lineHeight: 1.7, marginBottom: 20 }}>
            Download the master template, fill in multiple software entries with contract and license details, then upload in one go. New SW_IDs and ENT_IDs are auto-generated.
          </div>
          <ul style={{ fontSize: 12, color: "var(--tx-m)", paddingLeft: 16, lineHeight: 2, marginBottom: 20 }}>
            <li>Multiple entries in a single upload</li>
            <li>Pre-formatted XLSX template with example row</li>
            <li>Auto-creates SW_IDs, ENT_IDs, Contracts</li>
          </ul>
          <button className="btn btn-p btn-sm" style={{ background: "var(--teal-m)" }} onClick={e => { e.stopPropagation(); onSelect("bulk"); }}>
            Download Template →
          </button>
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
    const a = document.createElement("a");
    a.href = url;
    a.download = "DRL_BulkOnboarding_Template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleProcess = async () => {
    if (!file) return;
    setProcessing(true); setError(null);
    try {
      const res = await bulkOnboard(file);
      setResult(res);
    } catch (e) {
      setError(e?.response?.data?.detail || "Processing failed. Check your template format.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)", overflow: "hidden", padding: "18px 32px 0" }}>
      <div style={{ flexShrink: 0, marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: "var(--tx-q)", marginBottom: 4 }}>
          <span style={{ cursor: "pointer", color: "var(--blue-m)" }} onClick={onBack}>Onboard Software</span>
          <span style={{ color: "var(--tx-m)" }}> › </span> Bulk Upload
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 2 }}>Bulk Software Onboarding</h1>
        <p style={{ fontSize: 12.5, color: "var(--tx-m)" }}>Download the template, fill in multiple entries, upload to create SW_IDs and ENT_IDs in one pass.</p>
      </div>

      {/* Template banner */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 14, background: "#EFF6FF", border: "1.5px dashed #93C5FD", borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: 6, background: "#DBEAFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>📄</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1E40AF", marginBottom: 2 }}>
            DRL_BulkOnboarding_Template.xlsx
          </div>
          <div style={{ fontSize: 11, color: "#3B82F6" }}>
            Columns: Software Name · SW_ID · Publisher · Category · Deployment · GxP · Vendor Risk · Notes · Contract Name · PO · CLM · Dates · Total Value · Auto-Renewal · License Type · Metric · Entitled · Unit Cost · Annual Cost
          </div>
        </div>
        <button style={{ flexShrink: 0, background: "var(--navy-mid)", color: "#fff", border: "none", borderRadius: 6, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={handleDownload}>
          ↓ Download Template
        </button>
      </div>

      {/* Upload section */}
      {!result && (
        <div style={{ flexShrink: 0, border: "1px solid var(--bdr)", borderRadius: 10, padding: 24, maxWidth: 600, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Step 2 — Upload Filled Template</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={e => setFile(e.target.files?.[0] || null)} />
            <button className="btn btn-o btn-sm" onClick={() => fileRef.current?.click()}>Choose File</button>
            {file
              ? <span style={{ fontSize: 12, color: "var(--teal-m)", fontWeight: 600 }}>{file.name}</span>
              : <span style={{ fontSize: 12, color: "var(--tx-q)" }}>No file selected · .xlsx only</span>}
            {file && <button style={{ background: "none", border: "none", color: "var(--tx-q)", cursor: "pointer" }} onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>✕</button>}
          </div>
          {error && <div style={{ background: "#fff0f0", border: "1px solid var(--red-m)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--red-m)", marginBottom: 12 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-p btn-sm" style={{ background: "var(--navy-mid)" }} disabled={!file || processing} onClick={handleProcess}>
              {processing ? "Processing…" : "Process & Create Records"}
            </button>
            <button className="btn btn-o btn-sm" onClick={onBack}>← Back</button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ flexShrink: 0, border: "1px solid var(--bdr)", borderRadius: 10, padding: 24, maxWidth: 600 }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: "var(--green-m)" }}>Bulk onboarding complete</div>
          <div style={{ fontSize: 13, lineHeight: 2, marginBottom: 14 }}>
            <div><strong>{result.sw_created}</strong> new software entries created: {result.sw_ids?.join(", ") || "—"}</div>
            <div><strong>{result.ent_created}</strong> entitlements created: {result.ent_ids?.join(", ") || "—"}</div>
          </div>
          {result.skipped?.length > 0 && (
            <div style={{ background: "var(--amber-l)", border: "1px solid var(--amber-m)", borderRadius: 6, padding: "10px 12px", fontSize: 12, color: "var(--amber-m)", marginBottom: 14 }}>
              <strong>{result.skipped.length} rows skipped:</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>
                {result.skipped.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-p btn-sm" style={{ background: "var(--navy-mid)" }} onClick={() => { setResult(null); setFile(null); }}>Upload Another</button>
            <button className="btn btn-o btn-sm" onClick={onBack}>← Back to Selection</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Manual Two-Panel Flow ─────────────────────────────────────────────────────
function ManualFlow({ onBack }) {
  // Contract + AI state
  const [file, setFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [extractError, setExtractError] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState(null);

  // Contract metadata (left panel)
  const [meta, setMeta] = useState({ vendor_name: "", reseller: "", po_number: "", clm_id: "", start_date: "", end_date: "", total_value_inr: "", auto_renewal_clause: "" });

  // License details (left panel — single line item)
  const [license, setLicense] = useState({ contract_name: "", license_type: "subscription", metric_id: "", entitled_count: "", unit_cost_inr: "", annual_cost_inr: "" });

  // SW metadata (right panel)
  const [canonicalName, setCanonicalName] = useState("");
  const [mappingMode, setMappingMode] = useState("new");
  const [selectedSwId, setSelectedSwId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [deployment, setDeployment] = useState("cloud");
  const [regionId, setRegionId] = useState("");
  const [gxpFlag, setGxpFlag] = useState("no");
  const [vendorRisk, setVendorRisk] = useState("LOW");
  const [notes, setNotes] = useState("");

  // Owner (right panel)
  const [appOwnerId, setAppOwnerId] = useState("");
  const [aliases, setAliases] = useState([]);
  const [aliasInput, setAliasInput] = useState("");

  // Source config (right panel)
  const [discoverySourceId, setDiscoverySourceId] = useState("");
  const [usageMethodId, setUsageMethodId] = useState("");

  // Masters data
  const [categories, setCategories] = useState([]);
  const [regions, setRegions] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [sources, setSources] = useState([]);
  const [methods, setMethods] = useState([]);
  const [owners, setOwners] = useState([]);
  const [catalogBrief, setCatalogBrief] = useState([]);

  // Publish
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(null);
  const [publishError, setPublishError] = useState("");

  // Step progress
  const currentStep = uploadedFileName ? (extracted ? 1 : 1) : 0;

  useEffect(() => {
    Promise.all([
      fetchAllMasters(),
      fetchOwners(),
      fetchCatalogBrief(),
    ]).then(([masters, ownersList, brief]) => {
      setCategories(masters.categories || []);
      setRegions(masters.regions || []);
      setMetrics(masters.metrics || []);
      setSources(masters.discovery_sources || []);
      setMethods(masters.usage_methods || []);
      setOwners(ownersList);
      setCatalogBrief(brief);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!extracted) return;
    setMeta({
      vendor_name: extracted.vendor_name || "",
      reseller: extracted.reseller || "",
      po_number: extracted.po_number || "",
      clm_id: extracted.clm_id || "",
      start_date: extracted.start_date || "",
      end_date: extracted.end_date || "",
      total_value_inr: extracted.total_value_inr ?? "",
      auto_renewal_clause: extracted.auto_renewal_clause || "",
    });
    if (extracted.line_items?.length) {
      const li = extracted.line_items[0];
      setLicense({
        contract_name: li.contract_name || "",
        license_type: li.license_type || "subscription",
        metric_id: "",
        entitled_count: li.entitled_count ?? "",
        unit_cost_inr: li.unit_cost_inr ?? "",
        annual_cost_inr: li.annual_cost_inr ?? "",
      });
    }
    if (extracted.vendor_name) setCanonicalName(extracted.vendor_name);
  }, [extracted]);

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true); setExtractError("");
    try {
      const result = await extractContract(file);
      setExtracted(result);
      setUploadedFileName(file.name);
    } catch (e) {
      setExtractError(e?.response?.data?.detail || "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  };

  const handlePublish = async () => {
    if (!canonicalName.trim() && mappingMode === "new") { setPublishError("Software Name is required."); return; }
    if (!license.contract_name.trim()) { setPublishError("Contract Name (in License Details) is required."); return; }
    setPublishing(true); setPublishError("");
    try {
      const resolvedCanonical = mappingMode === "existing"
        ? (catalogBrief.find(s => s.sw_id === selectedSwId)?.canonical_name || canonicalName)
        : canonicalName;

      const payload = {
        po_number: meta.po_number || undefined,
        clm_id: meta.clm_id || undefined,
        reseller: meta.reseller || undefined,
        start_date: meta.start_date || undefined,
        end_date: meta.end_date || undefined,
        total_value_inr: meta.total_value_inr ? parseInt(meta.total_value_inr) : undefined,
        auto_renewal_clause: meta.auto_renewal_clause || undefined,
        canonical_name: resolvedCanonical,
        sw_id: mappingMode === "existing" ? selectedSwId : undefined,
        publisher: meta.vendor_name || undefined,
        category_id: categoryId || undefined,
        sub_category_id: subCategoryId || undefined,
        gxp_flag: gxpFlag,
        vendor_risk: vendorRisk,
        deployment,
        region_id: regionId || undefined,
        app_owner_id: appOwnerId || undefined,
        notes: notes || undefined,
        line_items: [{
          contract_name: license.contract_name,
          license_type: license.license_type,
          metric: metrics.find(m => m.id === license.metric_id)?.name || "",
          entitled_count: license.entitled_count ? parseInt(license.entitled_count) : undefined,
          unit_cost_inr: license.unit_cost_inr ? parseInt(license.unit_cost_inr) : undefined,
          annual_cost_inr: license.annual_cost_inr ? parseInt(license.annual_cost_inr) : undefined,
          region_id: regionId || undefined,
          discovery_source_id: discoverySourceId || undefined,
          usage_method_id: usageMethodId || undefined,
          app_owner_id: appOwnerId || undefined,
        }].filter(l => l.contract_name),
        aliases,
      };
      const result = await publishOnboarding(payload);
      setPublished(result);
    } catch (e) {
      setPublishError(e?.response?.data?.detail || "Publish failed. Review all required fields.");
    } finally {
      setPublishing(false);
    }
  };

  // Sub-categories for selected category
  const subCats = categories.find(c => c.id === categoryId)?.sub_categories || [];

  if (published) {
    return (
      <div style={{ padding: "28px 32px" }}>
        <div style={{ fontSize: 11, color: "var(--tx-q)", marginBottom: 4 }}>SAM Platform <span style={{ color: "var(--tx-m)" }}>›</span> Onboard Software</div>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Onboarding Complete</h1>
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 10, padding: 28, maxWidth: 480 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Software registered successfully</div>
          <div style={{ fontSize: 13, color: "var(--tx-m)", lineHeight: 2, marginBottom: 16 }}>
            <div><strong>SW_ID:</strong> <code style={{ background: "var(--bg2)", padding: "2px 6px", borderRadius: 3 }}>{published.sw_id}</code></div>
            <div><strong>Contract ID:</strong> <code style={{ fontSize: 11 }}>{published.contract_id}</code></div>
            <div><strong>Entitlements:</strong> {published.ent_ids.join(", ")}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-p btn-sm" style={{ background: "var(--navy-mid)" }} onClick={onBack}>Onboard Another</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)", overflow: "hidden", padding: "18px 28px 0" }}>

      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "var(--tx-q)", marginBottom: 3 }}>
          <span style={{ cursor: "pointer", color: "var(--blue-m)" }} onClick={onBack}>Onboard Software</span>
          <span style={{ color: "var(--tx-m)" }}> › </span> Manual
        </div>
        <h1 style={{ fontSize: 17, fontWeight: 600, marginBottom: 1 }}>Onboard New Software / License</h1>
        <p style={{ fontSize: 12, color: "var(--tx-m)" }}>Upload the signed contract · AI extracts key terms · fill remaining fields · publish to catalog</p>
      </div>

      {/* Stepper */}
      <div style={{ flexShrink: 0, marginBottom: 14 }}>
        <Stepper current={currentStep} />
      </div>

      {/* Two-panel layout */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 20, overflow: "hidden", marginBottom: 12 }}>

        {/* ── LEFT PANEL ─────────────────────────────────────────────── */}
        <div style={{ width: 420, flexShrink: 0, overflowY: "auto" }}>

          {/* Step 1: Signed Contract */}
          <SectionCard
            title="Step 1 — Signed Contract"
            badge={uploadedFileName
              ? <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 4, background: "var(--green-l)", color: "var(--green-m)" }}>✓ Uploaded</span>
              : null}
          >
            {!uploadedFileName ? (
              <>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-q)", marginBottom: 5, display: "block" }}>Contract PDF or DOCX</label>
                  <input type="file" accept=".pdf,.docx,.doc" className="fi2" style={{ width: "100%" }}
                    onChange={e => setFile(e.target.files?.[0] || null)} />
                  <div style={{ fontSize: 10, color: "var(--tx-q)", marginTop: 4 }}>Max 25 MB · AI extracts vendor, PO, dates, and line items</div>
                </div>
                {extractError && <div style={{ color: "var(--red-m)", fontSize: 12, marginBottom: 8 }}>{extractError}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-p btn-sm" style={{ background: "var(--navy-mid)" }} onClick={handleExtract} disabled={!file || extracting}>
                    {extracting ? "Extracting…" : "Extract with AI →"}
                  </button>
                  <button className="btn btn-o btn-sm" onClick={() => setUploadedFileName("manual")}>Skip →</button>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", gap: 10, alignItems: "center", background: "var(--navy-xlt)", borderRadius: 6, padding: "10px 12px" }}>
                <span style={{ fontSize: 18 }}>📄</span>
                <div style={{ flex: 1, fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: "var(--navy-mid)" }}>{uploadedFileName === "manual" ? "Manual entry" : uploadedFileName}</div>
                  {extracted && <div style={{ fontSize: 11, color: "var(--tx-m)" }}>{extracted.line_items?.length || 0} line items extracted</div>}
                </div>
                <button className="btn btn-o btn-sm" style={{ fontSize: 11 }} onClick={() => { setUploadedFileName(null); setExtracted(null); setFile(null); }}>Change</button>
              </div>
            )}
          </SectionCard>

          {/* Step 2: AI-Extracted Fields */}
          <SectionCard
            title="Step 2 — AI-Extracted Fields"
            badge={extracted ? (
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--teal-m)" }}>
                {Object.values(meta).filter(Boolean).length + Object.values(license).filter(Boolean).length}/15 auto-filled
              </span>
            ) : null}
          >
            {extracted && (
              <div style={{ background: "var(--navy-xlt)", borderRadius: 6, padding: "7px 10px", fontSize: 11, color: "var(--navy-mid)", marginBottom: 14 }}>
                Contract scanned · High-confidence fields auto-populated. Amber fields flagged for human review.
              </div>
            )}

            <FieldRow>
              <Field label="Vendor / Publisher">
                <input className="fi2" style={{ width: "100%" }} value={meta.vendor_name} onChange={e => setMeta(m => ({ ...m, vendor_name: e.target.value }))} placeholder="e.g. Adobe Inc." />
              </Field>
              <Field label="Reseller">
                <input className="fi2" style={{ width: "100%" }} value={meta.reseller} onChange={e => setMeta(m => ({ ...m, reseller: e.target.value }))} placeholder="Optional" />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="PO Number" required>
                <input className="fi2" style={{ width: "100%" }} value={meta.po_number} onChange={e => setMeta(m => ({ ...m, po_number: e.target.value }))} placeholder="PO-2026-100" />
              </Field>
              <Field label="CLM ID / Contract Ref">
                <input className="fi2" style={{ width: "100%" }} value={meta.clm_id} onChange={e => setMeta(m => ({ ...m, clm_id: e.target.value }))} placeholder="e.g. CLM-2026-00142" />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Start Date">
                <input className="fi2" style={{ width: "100%" }} type="date" value={meta.start_date} onChange={e => setMeta(m => ({ ...m, start_date: e.target.value }))} />
              </Field>
              <Field label="End Date">
                <input className="fi2" style={{ width: "100%" }} type="date" value={meta.end_date} onChange={e => setMeta(m => ({ ...m, end_date: e.target.value }))} />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Total Contract Value (₹)" amber={!!extracted?.total_value_inr}
                hint={extracted?.total_value_inr ? `Extracted ₹${Number(extracted.total_value_inr).toLocaleString("en-IN")} — verify with Finance` : null}>
                <input className="fi2" style={{ width: "100%" }} type="number" value={meta.total_value_inr} onChange={e => setMeta(m => ({ ...m, total_value_inr: e.target.value }))} placeholder="e.g. 1,84,00,000" />
              </Field>
              <Field label="Auto-Renewal Clause" amber={!!extracted?.auto_renewal_clause}>
                <select className="fi2" style={{ width: "100%" }} value={meta.auto_renewal_clause} onChange={e => setMeta(m => ({ ...m, auto_renewal_clause: e.target.value }))}>
                  <option value="">Select…</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                  <option value="opt_in">Opt-In</option>
                </select>
              </Field>
            </FieldRow>

            {/* License details in left panel */}
            <div style={{ borderTop: "1px solid var(--bdr)", margin: "12px 0", paddingTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx-q)", letterSpacing: 0.5, marginBottom: 10, textTransform: "uppercase" }}>Step 4 — License Details</div>
              <Field label="Contract / License Name" required>
                <input className="fi2" style={{ width: "100%", marginBottom: 10 }} value={license.contract_name} onChange={e => setLicense(l => ({ ...l, contract_name: e.target.value }))} placeholder="e.g. Adobe VIP Renewal FY26" />
              </Field>
              <FieldRow>
                <Field label="Total Seats / Units" amber={!!extracted?.line_items?.[0]?.entitled_count}
                  hint={extracted?.line_items?.[0]?.entitled_count ? `Extracted ~${extracted.line_items[0].entitled_count} — confirm from contract` : null}>
                  <input className="fi2" style={{ width: "100%" }} type="number" value={license.entitled_count} onChange={e => setLicense(l => ({ ...l, entitled_count: e.target.value }))} />
                </Field>
                <Field label="License Type">
                  <select className="fi2" style={{ width: "100%" }} value={license.license_type} onChange={e => setLicense(l => ({ ...l, license_type: e.target.value }))}>
                    <option value="subscription">Subscription</option>
                    <option value="perpetual">Perpetual</option>
                  </select>
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="License Metric">
                  <select className="fi2" style={{ width: "100%" }} value={license.metric_id} onChange={e => setLicense(l => ({ ...l, metric_id: e.target.value }))}>
                    <option value="">Select metric…</option>
                    {metrics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </Field>
                <Field label="Unit Cost (₹)">
                  <input className="fi2" style={{ width: "100%" }} type="number" value={license.unit_cost_inr} onChange={e => setLicense(l => ({ ...l, unit_cost_inr: e.target.value }))} />
                </Field>
              </FieldRow>
              <Field label="Annual Cost (₹)">
                <input className="fi2" style={{ width: "100%" }} type="number" value={license.annual_cost_inr} onChange={e => setLicense(l => ({ ...l, annual_cost_inr: e.target.value }))} />
              </Field>
            </div>
          </SectionCard>
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>

          {/* Step 3: Software Metadata */}
          <SectionCard title="Step 3 — Software Metadata">
            <FieldRow>
              <Field label="Software Name" required>
                {mappingMode === "new" ? (
                  <input className="fi2" style={{ width: "100%" }} value={canonicalName} onChange={e => setCanonicalName(e.target.value)} placeholder="e.g. Adobe Acrobat Pro" />
                ) : (
                  <select className="fi2" style={{ width: "100%" }} value={selectedSwId} onChange={e => setSelectedSwId(e.target.value)}>
                    <option value="">Select existing SW…</option>
                    {catalogBrief.map(sw => <option key={sw.sw_id} value={sw.sw_id}>{sw.sw_id} — {sw.canonical_name}</option>)}
                  </select>
                )}
              </Field>
              <Field label="SW_ID (auto or map)">
                <div style={{ display: "flex", gap: 6 }}>
                  <button className={`btn btn-sm ${mappingMode === "new" ? "btn-p" : "btn-o"}`} style={{ fontSize: 11 }} onClick={() => setMappingMode("new")}>Create New</button>
                  <button className={`btn btn-sm ${mappingMode === "existing" ? "btn-p" : "btn-o"}`} style={{ fontSize: 11 }} onClick={() => setMappingMode("existing")}>Map Existing</button>
                </div>
                {mappingMode === "new" && <div style={{ fontSize: 10, color: "var(--tx-q)", marginTop: 4 }}>Auto-assigned on publish</div>}
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Category" required>
                <select className="fi2" style={{ width: "100%" }} value={categoryId} onChange={e => { setCategoryId(e.target.value); setSubCategoryId(""); }}>
                  <option value="">Select category…</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Sub-Category" required>
                <select className="fi2" style={{ width: "100%" }} value={subCategoryId} onChange={e => setSubCategoryId(e.target.value)} disabled={!categoryId}>
                  <option value="">{categoryId ? "Select sub-category…" : "Select category first"}</option>
                  {subCats.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Deployment">
                <select className="fi2" style={{ width: "100%" }} value={deployment} onChange={e => setDeployment(e.target.value)}>
                  <option value="cloud">Cloud</option>
                  <option value="on_premise">On-Premise</option>
                  <option value="desktop_cloud">Desktop/Cloud</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </Field>
              <Field label="Region / Scope" required>
                <select className="fi2" style={{ width: "100%" }} value={regionId} onChange={e => setRegionId(e.target.value)}>
                  <option value="">Select region…</option>
                  {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="GxP Relevant?" required>
                <select className="fi2" style={{ width: "100%" }} value={gxpFlag === "no" ? "no" : "yes"} onChange={e => setGxpFlag(e.target.value === "yes" ? "yes_21cfr" : "no")}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </Field>
              <Field label="Vendor Audit Risk">
                <select className="fi2" style={{ width: "100%" }} value={vendorRisk} onChange={e => setVendorRisk(e.target.value)}>
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                </select>
              </Field>
            </FieldRow>
            <Field label="Notes / Description (Use of Software)">
              <textarea className="fi2" rows={3} style={{ width: "100%", resize: "vertical" }} value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Describe the purpose of this software, primary users, departments…" />
            </Field>
          </SectionCard>

          {/* Step 5: Owner & DOA */}
          <SectionCard title="Step 5 — Owner &amp; DOA Escalation">
            <FieldRow>
              <Field label="Primary App Owner" required>
                <select className="fi2" style={{ width: "100%" }} value={appOwnerId} onChange={e => setAppOwnerId(e.target.value)}>
                  <option value="">Select owner…</option>
                  {owners.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.full_name} ({o.business_unit || o.role})</option>)}
                </select>
              </Field>
              <Field label="Aliases (alt. names)">
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="fi2" style={{ flex: 1 }} placeholder="e.g. MS365, Office 365"
                    value={aliasInput} onChange={e => setAliasInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && aliasInput.trim()) { setAliases(a => [...a, aliasInput.trim()]); setAliasInput(""); } }} />
                  <button className="btn btn-o btn-sm" onClick={() => { if (aliasInput.trim()) { setAliases(a => [...a, aliasInput.trim()]); setAliasInput(""); } }}>+ Add</button>
                </div>
                {aliases.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {aliases.map((a, i) => (
                      <span key={i} style={{ fontSize: 11, background: "var(--navy-xlt)", color: "var(--navy-mid)", borderRadius: 12, padding: "2px 10px", display: "flex", alignItems: "center", gap: 4 }}>
                        {a}
                        <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx-q)", fontSize: 11, padding: 0 }} onClick={() => setAliases(as => as.filter((_, idx) => idx !== i))}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </Field>
            </FieldRow>
          </SectionCard>

          {/* Step 6: Source & Usage Config */}
          <SectionCard title="Step 6 — Source &amp; Usage Update Config">
            <FieldRow>
              <Field label="Discovery Source" required>
                <select className="fi2" style={{ width: "100%" }} value={discoverySourceId} onChange={e => setDiscoverySourceId(e.target.value)}>
                  <option value="">Select source…</option>
                  {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Usage Update Method" required>
                <select className="fi2" style={{ width: "100%" }} value={usageMethodId} onChange={e => setUsageMethodId(e.target.value)}>
                  <option value="">Select method…</option>
                  {methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
            </FieldRow>
          </SectionCard>

          {/* Publish */}
          <div style={{ paddingBottom: 20 }}>
            {publishError && (
              <div style={{ background: "#fff0f0", border: "1px solid var(--red-m)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--red-m)", marginBottom: 12 }}>
                {publishError}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-p" style={{ background: "var(--navy-mid)" }} onClick={handlePublish} disabled={publishing}>
                {publishing ? "Publishing…" : "Publish & Create Records"}
              </button>
              <button className="btn btn-o btn-sm" onClick={onBack}>← Back to Selection</button>
            </div>
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
  if (mode === "bulk") return <BulkUploadFlow onBack={() => setMode(null)} />;
  return <MethodSelection onSelect={setMode} />;
}
