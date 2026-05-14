import { useState, useEffect, useCallback } from "react";
import {
  fetchCategories, createCategory, deleteCategory,
  createSubCategory, deleteSubCategory,
  fetchVendors, createVendor, deleteVendor,
  fetchMetrics, createMetric, deleteMetric,
  fetchSources, createSource, deleteSource,
  fetchMethods, createMethod, deleteMethod,
  fetchRegions, createRegion, deleteRegion,
} from "../../api/masters";

const TABS = [
  "Categories", "Vendors", "License Metrics",
  "Discovery Sources", "Usage Methods", "Regions / Sites",
];

const GXP_BADGE = {
  no: <span className="tag tg2">No</span>,
  yes: <span className="tag tr2">GxP</span>,
  mixed: <span className="tag ta2">Mixed</span>,
};
const RISK_BADGE = {
  LOW: <span className="vr-low">LOW</span>,
  MEDIUM: <span className="vr-med">MED</span>,
  HIGH: <span className="vr-high">HIGH</span>,
};
const STATUS_BADGE = {
  active: <span className="tag tg2">Active</span>,
  inactive: <span className="tag tgr2">Inactive</span>,
  stale: <span className="tag ta2">Stale &gt;30d</span>,
};
const TPL_BADGE = {
  none: <span className="tag tgr2">No</span>,
  tab_a: <span className="tag tb3">Tab A</span>,
  tab_a_and_b: <span className="tag tg2">Tab A + B</span>,
};

function useCRUD(fetcher) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try { setItems(await fetcher()); } finally { setLoading(false); }
  }, [fetcher]);
  useEffect(() => { reload(); }, [reload]);
  return { items, loading, reload };
}

// ── Categories ────────────────────────────────────────────────────────────────
function CategoriesPanel() {
  const { items, loading, reload } = useCRUD(fetchCategories);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", gxp_applicable: "no" });
  const [expanded, setExpanded] = useState({});

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await createCategory(form);
    setForm({ name: "", gxp_applicable: "no" });
    setShowAdd(false);
    reload();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="ct">Software Categories &amp; Sub-Categories</div>
        <button className="btn btn-p btn-sm" onClick={() => setShowAdd(v => !v)}>+ Add Category</button>
      </div>
      {showAdd && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div className="fr3">
            <div className="fg">
              <label className="fl">Category Name <span className="req">*</span></label>
              <input className="fi2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Clinical Data Management" />
            </div>
            <div className="fg">
              <label className="fl">GxP Applicable?</label>
              <select className="fi2" value={form.gxp_applicable} onChange={e => setForm(f => ({ ...f, gxp_applicable: e.target.value }))}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button className="btn btn-p btn-sm" onClick={handleAdd}>Save Category</button>
            <button className="btn btn-o btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="tw"><div className="tw-body">
        <table>
          <thead><tr><th>Category</th><th>GxP</th><th>Sub-categories</th><th>Expand</th><th>Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan="5" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {items.map(cat => (
              <>
                <tr key={cat.id}>
                  <td><strong>{cat.name}</strong></td>
                  <td>{GXP_BADGE[cat.gxp_applicable]}</td>
                  <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{cat.sub_categories.map(s => s.name).join(" · ") || "—"}</td>
                  <td>
                    <button className="btn btn-o btn-sm" onClick={() => setExpanded(e => ({ ...e, [cat.id]: !e[cat.id] }))}>
                      {expanded[cat.id] ? "▲" : "▾ Expand"}
                    </button>
                  </td>
                  <td>
                    <div className="crud-actions">
                      <button className="btn btn-d btn-sm" onClick={async () => {
                        if (!window.confirm("Delete this category and all sub-categories?")) return;
                        await deleteCategory(cat.id);
                        reload();
                      }}>Delete</button>
                    </div>
                  </td>
                </tr>
                {expanded[cat.id] && (
                  <tr key={`${cat.id}-exp`}>
                    <td colSpan="5" style={{ padding: "10px 14px", background: "#FAFBFD", borderTop: "1px solid var(--bdr)" }}>
                      <div style={{ fontSize: 12, color: "var(--tx-m)", marginBottom: 8 }}>Sub-categories:</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {cat.sub_categories.map(s => (
                          <span key={s.id} style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 5, padding: "3px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                            {s.name}
                            <button style={{ border: "none", background: "none", color: "var(--tx-q)", cursor: "pointer" }}
                              onClick={async () => { await deleteSubCategory(s.id); reload(); }}>×</button>
                          </span>
                        ))}
                        <button className="btn btn-o btn-sm" style={{ fontSize: 11 }} onClick={async () => {
                          const name = window.prompt("Sub-category name:");
                          if (name?.trim()) { await createSubCategory({ category_id: cat.id, name }); reload(); }
                        }}>+ Add Sub</button>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div></div>
    </>
  );
}

// ── Vendors ───────────────────────────────────────────────────────────────────
function VendorsPanel() {
  const { items, loading, reload } = useCRUD(fetchVendors);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", audit_risk: "LOW", last_audit_date: "", notes: "" });

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await createVendor({ ...form, last_audit_date: form.last_audit_date || null, notes: form.notes || null });
    setForm({ name: "", audit_risk: "LOW", last_audit_date: "", notes: "" });
    setShowAdd(false);
    reload();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="ct">Vendor Master</div>
        <button className="btn btn-p btn-sm" onClick={() => setShowAdd(v => !v)}>+ Add Vendor</button>
      </div>
      {showAdd && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div className="fr3">
            <div className="fg">
              <label className="fl">Vendor Name <span className="req">*</span></label>
              <input className="fi2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Medidata Solutions" />
            </div>
            <div className="fg">
              <label className="fl">Audit Risk</label>
              <select className="fi2" value={form.audit_risk} onChange={e => setForm(f => ({ ...f, audit_risk: e.target.value }))}>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH (Oracle / SAP / IBM / Broadcom)</option>
              </select>
            </div>
            <div className="fg">
              <label className="fl">Last Audit Year</label>
              <input className="fi2" value={form.last_audit_date} onChange={e => setForm(f => ({ ...f, last_audit_date: e.target.value }))} placeholder="e.g. 2024" />
            </div>
          </div>
          <div className="fg">
            <label className="fl">Notes</label>
            <input className="fi2" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
          </div>
          <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
            <button className="btn btn-p btn-sm" onClick={handleAdd}>Save Vendor</button>
            <button className="btn btn-o btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="tw"><div className="tw-body">
        <table>
          <thead><tr><th>Vendor</th><th>Audit Risk</th><th>Last Audit</th><th>Notes</th><th>Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan="5" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {items.map(v => (
              <tr key={v.id}>
                <td><strong>{v.name}</strong></td>
                <td>{RISK_BADGE[v.audit_risk]}</td>
                <td style={{ fontSize: 11 }}>{v.last_audit_date || "—"}</td>
                <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{v.notes || "—"}</td>
                <td>
                  <div className="crud-actions">
                    <button className="btn btn-d btn-sm" onClick={async () => {
                      if (!window.confirm("Delete vendor?")) return;
                      await deleteVendor(v.id);
                      reload();
                    }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </>
  );
}

// ── Metrics ───────────────────────────────────────────────────────────────────
function MetricsPanel() {
  const { items, loading, reload } = useCRUD(fetchMetrics);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", how_to_count: "" });

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await createMetric({ ...form, description: form.description || null, how_to_count: form.how_to_count || null });
    setForm({ name: "", description: "", how_to_count: "" });
    setShowAdd(false);
    reload();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="ct">License Metrics</div>
        <button className="btn btn-p btn-sm" onClick={() => setShowAdd(v => !v)}>+ Add Metric</button>
      </div>
      {showAdd && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div className="fr3">
            <div className="fg">
              <label className="fl">Metric Name <span className="req">*</span></label>
              <input className="fi2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Per Study" />
            </div>
            <div className="fg">
              <label className="fl">Description</label>
              <input className="fi2" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" />
            </div>
            <div className="fg">
              <label className="fl">How to Count</label>
              <input className="fi2" value={form.how_to_count} onChange={e => setForm(f => ({ ...f, how_to_count: e.target.value }))} placeholder="e.g. Count active studies" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button className="btn btn-p btn-sm" onClick={handleAdd}>Save Metric</button>
            <button className="btn btn-o btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="tw"><div className="tw-body">
        <table>
          <thead><tr><th>Metric</th><th>Description</th><th>How to Count</th><th>Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan="4" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {items.map(m => (
              <tr key={m.id}>
                <td><strong>{m.name}</strong></td>
                <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{m.description || "—"}</td>
                <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{m.how_to_count || "—"}</td>
                <td>
                  <div className="crud-actions">
                    <button className="btn btn-d btn-sm" onClick={async () => {
                      if (!window.confirm("Delete metric?")) return;
                      await deleteMetric(m.id);
                      reload();
                    }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </>
  );
}

// ── Discovery Sources ─────────────────────────────────────────────────────────
function SourcesPanel() {
  const { items, loading, reload } = useCRUD(fetchSources);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", type: "manual", coverage: "", frequency: "", contact: "", status: "active", notes: "" });

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await createSource({ ...form, coverage: form.coverage || null, frequency: form.frequency || null, contact: form.contact || null, notes: form.notes || null });
    setForm({ name: "", type: "manual", coverage: "", frequency: "", contact: "", status: "active", notes: "" });
    setShowAdd(false);
    reload();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="ct">Discovery Sources</div>
        <button className="btn btn-p btn-sm" onClick={() => setShowAdd(v => !v)}>+ Add Source</button>
      </div>
      {showAdd && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div className="fr3">
            <div className="fg">
              <label className="fl">Source Name <span className="req">*</span></label>
              <input className="fi2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Jamf Pro (Mac MDM)" />
            </div>
            <div className="fg">
              <label className="fl">Type</label>
              <select className="fi2" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {["agent", "cmdb", "edr", "network", "manual", "casb", "api"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Coverage</label>
              <input className="fi2" value={form.coverage} onChange={e => setForm(f => ({ ...f, coverage: e.target.value }))} placeholder="e.g. macOS endpoints only" />
            </div>
          </div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Frequency</label>
              <input className="fi2" value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} placeholder="e.g. Weekly" />
            </div>
            <div className="fg">
              <label className="fl">Contact / Owner</label>
              <input className="fi2" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} placeholder="e.g. IT Ops — J. Williams" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button className="btn btn-p btn-sm" onClick={handleAdd}>Save Source</button>
            <button className="btn btn-o btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="tw"><div className="tw-body">
        <table>
          <thead><tr><th>Source Name</th><th>Type</th><th>Coverage</th><th>Frequency</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan="7" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {items.map(s => (
              <tr key={s.id}>
                <td><strong>{s.name}</strong></td>
                <td style={{ fontSize: 11 }}>{s.type}</td>
                <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{s.coverage || "—"}</td>
                <td style={{ fontSize: 11 }}>{s.frequency || "—"}</td>
                <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{s.contact || "—"}</td>
                <td>{STATUS_BADGE[s.status]}</td>
                <td>
                  <div className="crud-actions">
                    <button className="btn btn-d btn-sm" onClick={async () => {
                      if (!window.confirm("Delete source?")) return;
                      await deleteSource(s.id);
                      reload();
                    }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </>
  );
}

// ── Usage Methods ─────────────────────────────────────────────────────────────
function MethodsPanel() {
  const { items, loading, reload } = useCRUD(fetchMethods);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", template_required: "none" });

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await createMethod({ ...form, description: form.description || null });
    setForm({ name: "", description: "", template_required: "none" });
    setShowAdd(false);
    reload();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="ct">Usage Update Methods</div>
        <button className="btn btn-p btn-sm" onClick={() => setShowAdd(v => !v)}>+ Add Method</button>
      </div>
      {showAdd && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div className="fr3">
            <div className="fg">
              <label className="fl">Method Name <span className="req">*</span></label>
              <input className="fi2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. API Auto-Sync" />
            </div>
            <div className="fg">
              <label className="fl">Description</label>
              <input className="fi2" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" />
            </div>
            <div className="fg">
              <label className="fl">Template Required?</label>
              <select className="fi2" value={form.template_required} onChange={e => setForm(f => ({ ...f, template_required: e.target.value }))}>
                <option value="none">No</option>
                <option value="tab_a">Yes — Tab A only</option>
                <option value="tab_a_and_b">Yes — Tab A + Tab B</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button className="btn btn-p btn-sm" onClick={handleAdd}>Save Method</button>
            <button className="btn btn-o btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="tw"><div className="tw-body">
        <table>
          <thead><tr><th>Method Name</th><th>Description</th><th>Template Required</th><th>Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan="4" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {items.map(m => (
              <tr key={m.id}>
                <td><strong>{m.name}</strong></td>
                <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{m.description || "—"}</td>
                <td>{TPL_BADGE[m.template_required]}</td>
                <td>
                  <div className="crud-actions">
                    <button className="btn btn-d btn-sm" onClick={async () => {
                      if (!window.confirm("Delete method?")) return;
                      await deleteMethod(m.id);
                      reload();
                    }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </>
  );
}

// ── Regions ───────────────────────────────────────────────────────────────────
function RegionsPanel() {
  const { items, loading, reload } = useCRUD(fetchRegions);
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [form, setForm] = useState({ name: "", sites_json: "", regulatory_zone: "", data_residency: "", aws_region: "" });

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await createRegion({
      ...form,
      sites_json: form.sites_json || null,
      regulatory_zone: form.regulatory_zone || null,
      data_residency: form.data_residency || null,
      aws_region: form.aws_region || null,
    });
    setForm({ name: "", sites_json: "", regulatory_zone: "", data_residency: "", aws_region: "" });
    setShowAdd(false);
    reload();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="ct">Regions &amp; Sites</div>
        <button className="btn btn-p btn-sm" onClick={() => setShowAdd(v => !v)}>+ Add Region / Site</button>
      </div>
      {showAdd && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div className="fr3">
            <div className="fg">
              <label className="fl">Region Name <span className="req">*</span></label>
              <input className="fi2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Russia / CIS" />
            </div>
            <div className="fg">
              <label className="fl">Sites</label>
              <input className="fi2" value={form.sites_json} onChange={e => setForm(f => ({ ...f, sites_json: e.target.value }))} placeholder="Comma-separated site names" />
            </div>
            <div className="fg">
              <label className="fl">Regulatory Zone</label>
              <input className="fi2" value={form.regulatory_zone} onChange={e => setForm(f => ({ ...f, regulatory_zone: e.target.value }))} placeholder="e.g. FDA · 21 CFR Part 11" />
            </div>
          </div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Data Residency</label>
              <input className="fi2" value={form.data_residency} onChange={e => setForm(f => ({ ...f, data_residency: e.target.value }))} placeholder="e.g. US (AWS us-east-1)" />
            </div>
            <div className="fg">
              <label className="fl">AWS Region</label>
              <input className="fi2" value={form.aws_region} onChange={e => setForm(f => ({ ...f, aws_region: e.target.value }))} placeholder="e.g. eu-central-1" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button className="btn btn-p btn-sm" onClick={handleAdd}>Save Region</button>
            <button className="btn btn-o btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="tw"><div className="tw-body">
        <table>
          <thead><tr><th>Region</th><th>Regulatory Zone</th><th>Data Residency</th><th>Expand</th><th>Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan="5" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {items.map(r => (
              <>
                <tr key={r.id}>
                  <td><strong>{r.name}</strong></td>
                  <td style={{ fontSize: 11 }}>{r.regulatory_zone || "—"}</td>
                  <td style={{ fontSize: 11 }}>{r.data_residency || "—"}</td>
                  <td>
                    <button className="btn btn-o btn-sm" onClick={() => setExpanded(e => ({ ...e, [r.id]: !e[r.id] }))}>
                      {expanded[r.id] ? "▲" : "▾ Expand"}
                    </button>
                  </td>
                  <td>
                    <div className="crud-actions">
                      <button className="btn btn-d btn-sm" onClick={async () => {
                        if (!window.confirm("Delete region?")) return;
                        await deleteRegion(r.id);
                        reload();
                      }}>Delete</button>
                    </div>
                  </td>
                </tr>
                {expanded[r.id] && (
                  <tr key={`${r.id}-exp`}>
                    <td colSpan="5" style={{ padding: "10px 14px", background: "#FAFBFD", fontSize: 12, color: "var(--tx-m)", borderTop: "1px solid var(--bdr)" }}>
                      <strong>Sites:</strong> {r.sites_json || "—"} &nbsp;·&nbsp; <strong>AWS:</strong> {r.aws_region || "—"}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div></div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MastersPage() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> Masters &amp; Config</div>
        <h1>Masters &amp; Configuration</h1>
        <p>Admin-managed reference data · Full CRUD on all master tables · Changes apply platform-wide immediately</p>
      </div>

      <div className="stabs" style={{ marginBottom: 18 }}>
        {TABS.map((t, i) => (
          <button key={t} className={`stab${tab === i ? " active" : ""}`} onClick={() => setTab(i)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <CategoriesPanel />}
      {tab === 1 && <VendorsPanel />}
      {tab === 2 && <MetricsPanel />}
      {tab === 3 && <SourcesPanel />}
      {tab === 4 && <MethodsPanel />}
      {tab === 5 && <RegionsPanel />}
    </div>
  );
}
