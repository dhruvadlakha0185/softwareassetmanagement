import { useState, useEffect, useCallback } from "react";
import { fetchCatalog, createCatalogEntry, deleteCatalogEntry, addAlias, deleteAlias } from "../../api/catalog";

const GXP_BADGE = {
  "no":          <span className="tag tg3">Non-GxP</span>,
  "yes_21cfr":   <span className="tag tg1">21 CFR</span>,
  "yes_annex11": <span className="tag tg1">Annex 11</span>,
  "yes_both":    <span className="tag tg1">GxP Both</span>,
};
const RISK_BADGE = {
  "LOW":    <span className="tag tg2">LOW</span>,
  "MEDIUM": <span className="tag tg4">MEDIUM</span>,
  "HIGH":   <span className="tag tgr2">HIGH</span>,
};
const DEPLOY_LABEL = {
  cloud: "Cloud", on_premise: "On-Premise", desktop_cloud: "Desktop/Cloud", hybrid: "Hybrid",
};

const EMPTY_FORM = {
  canonical_name: "", publisher: "", gxp_flag: "no",
  vendor_risk: "LOW", deployment: "cloud", notes: "",
};

export default function CatalogPage() {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterGxp, setFilterGxp] = useState("");
  const [filterRisk, setFilterRisk] = useState("");

  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [aliasInput, setAliasInput] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (filterGxp) params.gxp_flag = filterGxp;
      if (filterRisk) params.vendor_risk = filterRisk;
      const data = await fetchCatalog(params);
      setCatalog(data);
      // Refresh selected entry if visible
      if (selected) {
        const refreshed = data.find(s => s.sw_id === selected.sw_id);
        setSelected(refreshed || null);
      }
    } finally {
      setLoading(false);
    }
  }, [search, filterGxp, filterRisk]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload(); }, [reload]);

  const handleAdd = async () => {
    if (!form.canonical_name.trim()) return;
    await createCatalogEntry(form);
    setForm(EMPTY_FORM);
    setShowForm(false);
    reload();
  };

  const handleDelete = async (swId) => {
    if (!window.confirm(`Delete ${swId}? This cannot be undone.`)) return;
    await deleteCatalogEntry(swId);
    if (selected?.sw_id === swId) setSelected(null);
    reload();
  };

  const handleAddAlias = async () => {
    if (!aliasInput.trim() || !selected) return;
    await addAlias(selected.sw_id, { alias_name: aliasInput.trim(), source_name: "manual" });
    setAliasInput("");
    reload();
  };

  const handleDeleteAlias = async (aliasId) => {
    await deleteAlias(aliasId);
    reload();
  };

  return (
    <div className="page" style={{ display: "flex", gap: 0, paddingBottom: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ph">
          <div className="bc">SAM Platform <span>›</span> Software Catalog</div>
          <h1>Software Catalog</h1>
          <p>{catalog.length} software titles · canonical master list</p>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input
            className="fi2" style={{ flex: 1, minWidth: 180 }}
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="fi2" value={filterGxp} onChange={e => setFilterGxp(e.target.value)}>
            <option value="">All GxP</option>
            <option value="no">Non-GxP</option>
            <option value="yes_21cfr">21 CFR</option>
            <option value="yes_annex11">Annex 11</option>
            <option value="yes_both">GxP Both</option>
          </select>
          <select className="fi2" value={filterRisk} onChange={e => setFilterRisk(e.target.value)}>
            <option value="">All Risk</option>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>
          <button className="btn btn-p btn-sm" onClick={() => setShowForm(v => !v)}>+ Add Software</button>
        </div>

        {showForm && (
          <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div className="fr3">
              <div className="fg">
                <label className="fl">Canonical Name <span className="req">*</span></label>
                <input className="fi2" value={form.canonical_name} onChange={e => setForm(f => ({ ...f, canonical_name: e.target.value }))} placeholder="e.g. Microsoft 365" />
              </div>
              <div className="fg">
                <label className="fl">Publisher</label>
                <input className="fi2" value={form.publisher} onChange={e => setForm(f => ({ ...f, publisher: e.target.value }))} placeholder="e.g. Microsoft" />
              </div>
              <div className="fg">
                <label className="fl">GxP Flag</label>
                <select className="fi2" value={form.gxp_flag} onChange={e => setForm(f => ({ ...f, gxp_flag: e.target.value }))}>
                  <option value="no">Non-GxP</option>
                  <option value="yes_21cfr">21 CFR Part 11</option>
                  <option value="yes_annex11">Annex 11</option>
                  <option value="yes_both">Both</option>
                </select>
              </div>
            </div>
            <div className="fr3">
              <div className="fg">
                <label className="fl">Vendor Risk</label>
                <select className="fi2" value={form.vendor_risk} onChange={e => setForm(f => ({ ...f, vendor_risk: e.target.value }))}>
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                </select>
              </div>
              <div className="fg">
                <label className="fl">Deployment</label>
                <select className="fi2" value={form.deployment} onChange={e => setForm(f => ({ ...f, deployment: e.target.value }))}>
                  <option value="cloud">Cloud</option>
                  <option value="on_premise">On-Premise</option>
                  <option value="desktop_cloud">Desktop / Cloud</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div className="fg">
                <label className="fl">Notes</label>
                <input className="fi2" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
              <button className="btn btn-p btn-sm" onClick={handleAdd}>Save</button>
              <button className="btn btn-o btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>SW_ID</th><th>Canonical Name</th><th>Publisher</th>
                <th>GxP</th><th>Vendor Risk</th><th>Deployment</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="7" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
              {catalog.map(sw => (
                <tr
                  key={sw.sw_id}
                  style={{ cursor: "pointer", background: selected?.sw_id === sw.sw_id ? "var(--navy-xlt)" : undefined }}
                  onClick={() => setSelected(selected?.sw_id === sw.sw_id ? null : sw)}
                >
                  <td><code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{sw.sw_id}</code></td>
                  <td><strong>{sw.canonical_name}</strong></td>
                  <td style={{ fontSize: 11.5, color: "var(--tx-m)" }}>{sw.publisher || "—"}</td>
                  <td>{GXP_BADGE[sw.gxp_flag] ?? sw.gxp_flag}</td>
                  <td>{RISK_BADGE[sw.vendor_risk] ?? sw.vendor_risk}</td>
                  <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{DEPLOY_LABEL[sw.deployment] || sw.deployment}</td>
                  <td>
                    <div className="crud-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-d btn-sm" onClick={() => handleDelete(sw.sw_id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && catalog.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>No software entries. Add one above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div style={{
          width: 320, flexShrink: 0, borderLeft: "1px solid var(--bdr)",
          background: "var(--surf)", padding: "20px 18px", overflowY: "auto",
          position: "sticky", top: 0, alignSelf: "flex-start", maxHeight: "100vh",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <strong style={{ fontSize: 13 }}>{selected.sw_id}</strong>
            <button className="btn btn-o btn-sm" onClick={() => setSelected(null)}>✕</button>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{selected.canonical_name}</div>
          {selected.publisher && <div style={{ fontSize: 12, color: "var(--tx-m)", marginBottom: 12 }}>{selected.publisher}</div>}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
            {GXP_BADGE[selected.gxp_flag]}
            {RISK_BADGE[selected.vendor_risk]}
            <span className="tag tg3">{DEPLOY_LABEL[selected.deployment] || selected.deployment}</span>
          </div>

          {selected.notes && (
            <div style={{ fontSize: 12, color: "var(--tx-m)", marginBottom: 14, lineHeight: 1.5 }}>{selected.notes}</div>
          )}

          <div className="sdiv" style={{ fontSize: 11, marginBottom: 8 }}>Aliases ({selected.aliases?.length || 0})</div>
          {selected.aliases?.map(a => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--bdr)" }}>
              <span>{a.alias_name}</span>
              <button
                style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12 }}
                onClick={() => handleDeleteAlias(a.id)}
              >✕</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input
              className="fi2" style={{ flex: 1 }}
              placeholder="Add alias…"
              value={aliasInput}
              onChange={e => setAliasInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddAlias()}
            />
            <button className="btn btn-p btn-sm" onClick={handleAddAlias}>+</button>
          </div>
        </div>
      )}
    </div>
  );
}
