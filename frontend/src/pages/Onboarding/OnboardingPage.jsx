import { useState, useEffect } from "react";
import { extractContract, fetchDrafts, createDraft, updateDraft, deleteDraft, publishOnboarding } from "../../api/onboarding";
import { fetchCatalogBrief } from "../../api/catalog";

const STEPS = [
  "Upload Contract",
  "Contract Details",
  "Line Items",
  "Canonical Mapping",
  "App Owner & Notes",
  "Aliases",
  "Review & Publish",
];

const EMPTY_LINE = { contract_name: "", metric: "", license_type: "subscription", entitled_count: "", unit_cost_inr: "", annual_cost_inr: "" };

function StepBar({ current }) {
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 24 }}>
      {STEPS.map((s, i) => (
        <div key={i} style={{ flex: 1, textAlign: "center" }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%", margin: "0 auto 4px",
            background: i < current ? "var(--green, #00a651)" : i === current ? "var(--navy-mid)" : "var(--bdr)",
            color: i <= current ? "#fff" : "var(--tx-q)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700,
          }}>
            {i < current ? "✓" : i + 1}
          </div>
          <div style={{ fontSize: 10, color: i === current ? "var(--navy-mid)" : "var(--tx-q)", fontWeight: i === current ? 700 : 400 }}>
            {s}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [extractError, setExtractError] = useState("");

  // Step 2 — contract details
  const [meta, setMeta] = useState({ po_number: "", clm_id: "", reseller: "", start_date: "", end_date: "", total_value_inr: "", auto_renewal_clause: "" });

  // Step 3 — line items
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);

  // Step 4 — canonical mapping
  const [catalogBrief, setCatalogBrief] = useState([]);
  const [mappingMode, setMappingMode] = useState("new"); // "new" | "existing"
  const [canonicalName, setCanonicalName] = useState("");
  const [selectedSwId, setSelectedSwId] = useState("");
  const [gxpFlag, setGxpFlag] = useState("no");
  const [vendorRisk, setVendorRisk] = useState("LOW");
  const [deployment, setDeployment] = useState("cloud");

  // Step 5 — app owner
  const [appOwnerNotes, setAppOwnerNotes] = useState("");

  // Step 6 — aliases
  const [aliases, setAliases] = useState([]);
  const [aliasInput, setAliasInput] = useState("");

  // Drafts
  const [drafts, setDrafts] = useState([]);
  const [draftId, setDraftId] = useState(null);

  // Publish
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(null);

  useEffect(() => {
    fetchDrafts().then(setDrafts).catch(() => {});
    fetchCatalogBrief().then(setCatalogBrief).catch(() => {});
  }, []);

  // Pre-fill step 2+3 from extracted data
  useEffect(() => {
    if (!extracted) return;
    setMeta({
      po_number: extracted.po_number || "",
      clm_id: extracted.clm_id || "",
      reseller: extracted.reseller || "",
      start_date: extracted.start_date || "",
      end_date: extracted.end_date || "",
      total_value_inr: extracted.total_value_inr ?? "",
      auto_renewal_clause: extracted.auto_renewal_clause || "",
    });
    if (extracted.line_items?.length) {
      setLines(extracted.line_items.map(li => ({
        contract_name: li.contract_name || "",
        metric: li.metric || "",
        license_type: li.license_type || "subscription",
        entitled_count: li.entitled_count ?? "",
        unit_cost_inr: li.unit_cost_inr ?? "",
        annual_cost_inr: li.annual_cost_inr ?? "",
      })));
    }
  }, [extracted]);

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true);
    setExtractError("");
    try {
      const result = await extractContract(file);
      setExtracted(result);
      setStep(1);
    } catch (e) {
      setExtractError(e?.response?.data?.detail || "Extraction failed. Check the file and try again.");
    } finally {
      setExtracting(false);
    }
  };

  const saveDraft = async () => {
    const data = {
      po_number: meta.po_number || undefined,
      form_data_json: { step, meta, lines, canonicalName, selectedSwId, mappingMode, gxpFlag, vendorRisk, deployment, appOwnerNotes, aliases },
      current_step: step + 1,
    };
    try {
      if (draftId) {
        await updateDraft(draftId, data);
      } else {
        const d = await createDraft(data);
        setDraftId(d.id);
      }
      fetchDrafts().then(setDrafts).catch(() => {});
    } catch (e) {
      console.error("Draft save failed", e);
    }
  };

  const loadDraft = (draft) => {
    if (!draft.form_data_json) return;
    const d = draft.form_data_json;
    setStep(d.step || 0);
    setMeta(d.meta || { po_number: "", clm_id: "", reseller: "", start_date: "", end_date: "", total_value_inr: "", auto_renewal_clause: "" });
    setLines(d.lines?.length ? d.lines : [{ ...EMPTY_LINE }]);
    setCanonicalName(d.canonicalName || "");
    setSelectedSwId(d.selectedSwId || "");
    setMappingMode(d.mappingMode || "new");
    setGxpFlag(d.gxpFlag || "no");
    setVendorRisk(d.vendorRisk || "LOW");
    setDeployment(d.deployment || "cloud");
    setAppOwnerNotes(d.appOwnerNotes || "");
    setAliases(d.aliases || []);
    setDraftId(draft.id);
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const resolvedCanonical = mappingMode === "existing"
        ? (catalogBrief.find(s => s.sw_id === selectedSwId)?.canonical_name || canonicalName)
        : canonicalName;

      const payload = {
        ...meta,
        total_value_inr: meta.total_value_inr ? parseInt(meta.total_value_inr) : undefined,
        canonical_name: resolvedCanonical,
        sw_id: mappingMode === "existing" ? selectedSwId : undefined,
        gxp_flag: gxpFlag,
        vendor_risk: vendorRisk,
        deployment,
        notes: appOwnerNotes || undefined,
        line_items: lines
          .filter(l => l.contract_name.trim())
          .map(l => ({
            ...l,
            entitled_count: l.entitled_count ? parseInt(l.entitled_count) : undefined,
            unit_cost_inr: l.unit_cost_inr ? parseInt(l.unit_cost_inr) : undefined,
            annual_cost_inr: l.annual_cost_inr ? parseInt(l.annual_cost_inr) : undefined,
          })),
        aliases,
      };
      const result = await publishOnboarding(payload);
      setPublished(result);
      if (draftId) { await deleteDraft(draftId).catch(() => {}); setDraftId(null); }
    } catch (e) {
      alert(e?.response?.data?.detail || "Publish failed. Please review all fields and try again.");
    } finally {
      setPublishing(false);
    }
  };

  const resetWizard = () => {
    setPublished(null); setStep(0); setFile(null); setExtracted(null);
    setMeta({ po_number: "", clm_id: "", reseller: "", start_date: "", end_date: "", total_value_inr: "", auto_renewal_clause: "" });
    setLines([{ ...EMPTY_LINE }]); setCanonicalName(""); setSelectedSwId("");
    setMappingMode("new"); setGxpFlag("no"); setVendorRisk("LOW"); setDeployment("cloud");
    setAliases([]); setAppOwnerNotes(""); setDraftId(null);
    fetchDrafts().then(setDrafts).catch(() => {});
    fetchCatalogBrief().then(setCatalogBrief).catch(() => {});
  };

  if (published) {
    return (
      <div className="page">
        <div className="ph">
          <div className="bc">SAM Platform <span>›</span> Onboard Software</div>
          <h1>Onboarding Complete</h1>
        </div>
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 24, maxWidth: 480 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Software registered successfully</div>
          <div style={{ fontSize: 13, color: "var(--tx-m)", marginBottom: 12, lineHeight: 1.8 }}>
            <strong>SW_ID:</strong> {published.sw_id}<br />
            <strong>Contract ID:</strong> <span style={{ fontSize: 11 }}>{published.contract_id}</span><br />
            <strong>Entitlements created:</strong> {published.ent_ids.join(", ")}
          </div>
          <button className="btn btn-p btn-sm" onClick={resetWizard}>Onboard Another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> Onboard Software</div>
        <h1>Onboard New Software / License</h1>
        <p>7-step wizard with AI contract extraction</p>
      </div>

      {/* Resume drafts banner */}
      {drafts.length > 0 && !draftId && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Resume a saved draft</div>
          {drafts.map(d => (
            <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--bdr)" }}>
              <span style={{ fontSize: 12 }}>{d.po_number || "Draft"} — step {d.current_step}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-p btn-sm" onClick={() => loadDraft(d)}>Resume</button>
                <button className="btn btn-d btn-sm" onClick={async () => {
                  await deleteDraft(d.id).catch(() => {});
                  fetchDrafts().then(setDrafts).catch(() => {});
                }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <StepBar current={step} />

      <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 20, maxWidth: 720 }}>

        {/* ── Step 0: Upload Contract ── */}
        {step === 0 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Step 1 — Upload Contract File</div>
            <div className="fg">
              <label className="fl">Contract PDF or DOCX</label>
              <input type="file" accept=".pdf,.docx,.doc" className="fi2"
                onChange={e => setFile(e.target.files?.[0] || null)} />
              <div className="fhint">Max 25 MB · AI will extract vendor, PO, dates, and line items</div>
            </div>
            {extractError && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 6 }}>{extractError}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn btn-p btn-sm" onClick={handleExtract} disabled={!file || extracting}>
                {extracting ? "Extracting…" : "Extract with AI →"}
              </button>
              <button className="btn btn-o btn-sm" onClick={() => setStep(1)}>Skip — Enter Manually</button>
            </div>
          </div>
        )}

        {/* ── Step 1: Contract Metadata ── */}
        {step === 1 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Step 2 — Contract Details</div>
            {extracted && (
              <div style={{ background: "var(--navy-xlt)", borderRadius: 6, padding: "6px 10px", fontSize: 11, marginBottom: 12, color: "var(--navy-mid)" }}>
                AI-extracted data pre-filled below. Review and edit as needed.
              </div>
            )}
            <div className="fr3">
              <div className="fg">
                <label className="fl">PO Number</label>
                <input className="fi2" value={meta.po_number} onChange={e => setMeta(m => ({ ...m, po_number: e.target.value }))} placeholder="PO-2024-001" />
              </div>
              <div className="fg">
                <label className="fl">CLM ID</label>
                <input className="fi2" value={meta.clm_id} onChange={e => setMeta(m => ({ ...m, clm_id: e.target.value }))} placeholder="CLM-12345" />
              </div>
              <div className="fg">
                <label className="fl">Reseller</label>
                <input className="fi2" value={meta.reseller} onChange={e => setMeta(m => ({ ...m, reseller: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div className="fr3">
              <div className="fg">
                <label className="fl">Start Date</label>
                <input className="fi2" type="date" value={meta.start_date} onChange={e => setMeta(m => ({ ...m, start_date: e.target.value }))} />
              </div>
              <div className="fg">
                <label className="fl">End Date</label>
                <input className="fi2" type="date" value={meta.end_date} onChange={e => setMeta(m => ({ ...m, end_date: e.target.value }))} />
              </div>
              <div className="fg">
                <label className="fl">Auto-Renewal</label>
                <select className="fi2" value={meta.auto_renewal_clause} onChange={e => setMeta(m => ({ ...m, auto_renewal_clause: e.target.value }))}>
                  <option value="">Unknown</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                  <option value="opt_in">Opt-In</option>
                </select>
              </div>
            </div>
            <div className="fg" style={{ marginTop: 4 }}>
              <label className="fl">Total Value (INR)</label>
              <input className="fi2" type="number" value={meta.total_value_inr} onChange={e => setMeta(m => ({ ...m, total_value_inr: e.target.value }))} placeholder="e.g. 5000000" style={{ maxWidth: 200 }} />
            </div>
          </div>
        )}

        {/* ── Step 2: Line Items ── */}
        {step === 2 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Step 3 — License Line Items</div>
            {lines.map((line, idx) => (
              <div key={idx} style={{ background: "var(--bg2)", borderRadius: 6, padding: 10, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Line Item {idx + 1}</span>
                  {lines.length > 1 && (
                    <button className="btn btn-d btn-sm" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}>Remove</button>
                  )}
                </div>
                <div className="fr3">
                  <div className="fg">
                    <label className="fl">Contract Name <span className="req">*</span></label>
                    <input className="fi2" value={line.contract_name}
                      onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, contract_name: e.target.value } : l))}
                      placeholder="e.g. Microsoft 365 E3" />
                  </div>
                  <div className="fg">
                    <label className="fl">License Type</label>
                    <select className="fi2" value={line.license_type}
                      onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, license_type: e.target.value } : l))}>
                      <option value="subscription">Subscription</option>
                      <option value="perpetual">Perpetual</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">Metric</label>
                    <input className="fi2" value={line.metric}
                      onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, metric: e.target.value } : l))}
                      placeholder="e.g. Per User" />
                  </div>
                </div>
                <div className="fr3">
                  <div className="fg">
                    <label className="fl">Entitled Count</label>
                    <input className="fi2" type="number" value={line.entitled_count}
                      onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, entitled_count: e.target.value } : l))} />
                  </div>
                  <div className="fg">
                    <label className="fl">Unit Cost (INR)</label>
                    <input className="fi2" type="number" value={line.unit_cost_inr}
                      onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, unit_cost_inr: e.target.value } : l))} />
                  </div>
                  <div className="fg">
                    <label className="fl">Annual Cost (INR)</label>
                    <input className="fi2" type="number" value={line.annual_cost_inr}
                      onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, annual_cost_inr: e.target.value } : l))} />
                  </div>
                </div>
              </div>
            ))}
            <button className="btn btn-o btn-sm" onClick={() => setLines(ls => [...ls, { ...EMPTY_LINE }])}>+ Add Line Item</button>
          </div>
        )}

        {/* ── Step 3: Canonical Mapping ── */}
        {step === 3 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Step 4 — Canonical Name Mapping</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <button className={`btn btn-sm ${mappingMode === "new" ? "btn-p" : "btn-o"}`} onClick={() => setMappingMode("new")}>Create New SW Entry</button>
              <button className={`btn btn-sm ${mappingMode === "existing" ? "btn-p" : "btn-o"}`} onClick={() => setMappingMode("existing")}>Map to Existing SW</button>
            </div>
            {mappingMode === "new" ? (
              <div>
                <div className="fg">
                  <label className="fl">Canonical Name <span className="req">*</span></label>
                  <input className="fi2" value={canonicalName} onChange={e => setCanonicalName(e.target.value)} placeholder="e.g. Microsoft 365" />
                  <div className="fhint">This becomes the authoritative name across the SAM platform.</div>
                </div>
                <div className="fr3" style={{ marginTop: 8 }}>
                  <div className="fg">
                    <label className="fl">GxP Flag</label>
                    <select className="fi2" value={gxpFlag} onChange={e => setGxpFlag(e.target.value)}>
                      <option value="no">Non-GxP</option>
                      <option value="yes_21cfr">21 CFR Part 11</option>
                      <option value="yes_annex11">Annex 11</option>
                      <option value="yes_both">Both</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">Vendor Risk</label>
                    <select className="fi2" value={vendorRisk} onChange={e => setVendorRisk(e.target.value)}>
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">Deployment</label>
                    <select className="fi2" value={deployment} onChange={e => setDeployment(e.target.value)}>
                      <option value="cloud">Cloud</option>
                      <option value="on_premise">On-Premise</option>
                      <option value="desktop_cloud">Desktop / Cloud</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div className="fg">
                <label className="fl">Select Existing SW Entry <span className="req">*</span></label>
                <select className="fi2" value={selectedSwId} onChange={e => setSelectedSwId(e.target.value)}>
                  <option value="">Select…</option>
                  {catalogBrief.map(sw => (
                    <option key={sw.sw_id} value={sw.sw_id}>{sw.sw_id} — {sw.canonical_name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: App Owner & Notes ── */}
        {step === 4 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Step 5 — App Owner &amp; Notes</div>
            <div className="fg">
              <label className="fl">Notes / Additional Context</label>
              <textarea className="fi2" rows={4} value={appOwnerNotes}
                onChange={e => setAppOwnerNotes(e.target.value)}
                placeholder="Any additional context about this software or contract…"
                style={{ resize: "vertical" }} />
            </div>
          </div>
        )}

        {/* ── Step 5: Aliases ── */}
        {step === 5 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Step 6 — Aliases</div>
            <div className="fhint" style={{ marginBottom: 10 }}>Add all known names this software is referred to as (e.g., from SCCM, discovery sources, purchase orders).</div>
            {aliases.map((a, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--bdr)", fontSize: 13 }}>
                <span>{a}</span>
                <button style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }}
                  onClick={() => setAliases(as => as.filter((_, idx) => idx !== i))}>✕</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <input className="fi2" style={{ flex: 1 }}
                placeholder="e.g. MS365 · Office 365 · MSFT 365"
                value={aliasInput}
                onChange={e => setAliasInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && aliasInput.trim()) { setAliases(as => [...as, aliasInput.trim()]); setAliasInput(""); } }} />
              <button className="btn btn-p btn-sm" onClick={() => { if (aliasInput.trim()) { setAliases(as => [...as, aliasInput.trim()]); setAliasInput(""); } }}>+ Add</button>
            </div>
          </div>
        )}

        {/* ── Step 6: Review & Publish ── */}
        {step === 6 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Step 7 — Review &amp; Publish</div>
            <div style={{ fontSize: 12, lineHeight: 2 }}>
              <div><strong>Canonical Name:</strong> {mappingMode === "existing" ? (catalogBrief.find(s => s.sw_id === selectedSwId)?.canonical_name || "—") : canonicalName || "—"}</div>
              {mappingMode === "existing" && selectedSwId && <div><strong>Mapping to SW_ID:</strong> {selectedSwId}</div>}
              <div><strong>PO Number:</strong> {meta.po_number || "—"}</div>
              <div><strong>Period:</strong> {meta.start_date || "—"} → {meta.end_date || "—"}</div>
              <div><strong>Total Value:</strong> {meta.total_value_inr ? `₹${Number(meta.total_value_inr).toLocaleString("en-IN")}` : "—"}</div>
              <div><strong>Line Items:</strong> {lines.filter(l => l.contract_name).length} ({lines.filter(l => l.contract_name).map(l => l.contract_name).join(", ") || "—"})</div>
              <div><strong>Aliases:</strong> {aliases.length > 0 ? aliases.join(", ") : "None"}</div>
              <div><strong>GxP:</strong> {gxpFlag} · <strong>Risk:</strong> {vendorRisk} · <strong>Deploy:</strong> {deployment}</div>
              {appOwnerNotes && <div><strong>Notes:</strong> {appOwnerNotes}</div>}
            </div>
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-p" onClick={handlePublish} disabled={publishing}>
                {publishing ? "Publishing…" : "Publish & Create Records"}
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--bdr)" }}>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && <button className="btn btn-o btn-sm" onClick={() => setStep(s => s - 1)}>← Back</button>}
            <button className="btn btn-o btn-sm" onClick={saveDraft}>Save Draft</button>
          </div>
          {step < 6 && (
            <button className="btn btn-p btn-sm" onClick={() => setStep(s => s + 1)}>Next →</button>
          )}
        </div>
      </div>
    </div>
  );
}
