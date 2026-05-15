import { useState, useEffect, useCallback, useRef } from "react";
import { fetchCatalogRows, fetchCatalogDetail, addAlias, deleteAlias } from "../../api/catalog";
import { fetchCategories } from "../../api/masters";

// ── Helpers ──────────────────────────────────────────────────────────────────
// All non-"no" values display as "GxP" — framework detail is internal
function GxpBadge({ flag }) {
  if (!flag || flag === "no") return <span className="tag tg3">Non-GxP</span>;
  return <span className="tag tb3">GxP</span>;
}
const RISK_BADGE = {
  LOW:    <span className="tag tg2">LOW</span>,
  MEDIUM: <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: "var(--amber-l)", color: "var(--amber-m)" }}>MED</span>,
  HIGH:   <span className="tag tgr2">HIGH</span>,
};
const TYPE_BADGE = {
  subscription: <span className="tag tb3">Subscription</span>,
  perpetual:    <span className="tag tp2">Perpetual</span>,
};
const STATUS_BADGE = {
  ACTIVE:         <span className="tag tg2">Active</span>,
  WATCH:          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: "var(--amber-l)", color: "var(--amber-m)" }}>WATCH</span>,
  OVER_DEPLOYED:  <span className="tag tgr2">Over-Deployed</span>,
  UNDER_UTILISED: <span className="tag tg3">Under-Utilised</span>,
  EXPIRED:        <span className="tag tr2">Expired</span>,
  OK:             <span className="tag tg2">OK</span>,
};
const DEPLOY_LABEL = { cloud: "Cloud", on_premise: "On-Premise", desktop_cloud: "Desktop/Cloud", hybrid: "Hybrid" };

function fmtINR(n) {
  if (!n) return "—";
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(0)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function Avatar({ initials, name }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--navy-mid)", color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {initials || "?"}
      </div>
      <span style={{ fontSize: 12 }}>{name || "—"}</span>
    </div>
  );
}

function InfoCell({ label, value, wide }) {
  return (
    <div style={{ background: "var(--surf)", borderRadius: 6, padding: "10px 14px", gridColumn: wide ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx-q)", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{value || "—"}</div>
    </div>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────
function DetailDrawer({ swId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aliasInput, setAliasInput] = useState("");

  useEffect(() => {
    setLoading(true);
    fetchCatalogDetail(swId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [swId]);

  const handleAddAlias = async () => {
    if (!aliasInput.trim()) return;
    await addAlias(swId, { alias_name: aliasInput.trim(), source_name: "manual" });
    setAliasInput("");
    fetchCatalogDetail(swId).then(setDetail);
  };

  const handleDeleteAlias = async (aliasId) => {
    await deleteAlias(aliasId);
    fetchCatalogDetail(swId).then(setDetail);
  };

  const d = detail;
  const firstEnt = d?.entitlements?.[0];

  return (
    <div style={{
      width: 420, flexShrink: 0, borderLeft: "1px solid var(--bdr)",
      background: "var(--card)", display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--bdr)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>{loading ? "Loading…" : d?.canonical_name || swId}</strong>
        <button className="btn btn-o btn-sm" onClick={onClose}>✕ Close</button>
      </div>

      {loading && <div style={{ padding: 24, color: "var(--tx-q)", fontSize: 13 }}>Loading detail…</div>}

      {!loading && d && (
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>

          {/* Tags row */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            <GxpBadge flag={d.gxp_flag} />
            {firstEnt && TYPE_BADGE[firstEnt.license_type]}
            {RISK_BADGE[d.vendor_risk] && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: d.vendor_risk === "HIGH" ? "#fff0f0" : d.vendor_risk === "MEDIUM" ? "var(--amber-l)" : "var(--green-l)", color: d.vendor_risk === "HIGH" ? "var(--red-m)" : d.vendor_risk === "MEDIUM" ? "var(--amber-m)" : "var(--green-m)" }}>{d.vendor_risk} Audit Risk</span>}
            {firstEnt && STATUS_BADGE[firstEnt.status]}
          </div>

          {/* Info grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            <InfoCell label="SW_ID" value={<code style={{ fontSize: 13 }}>{d.sw_id.replace("-", "–")}</code>} />
            <InfoCell label="PUBLISHER" value={d.publisher} />
            <InfoCell label="CATEGORY" value={d.category_name} />
            <InfoCell label="SUB-CATEGORY" value={d.sub_category_name} />
            <InfoCell label="DEPLOYMENT" value={DEPLOY_LABEL[d.deployment] || d.deployment} />
            <InfoCell label="REGION" value={d.region_name} />
          </div>

          {/* Entitlement info (first ent) */}
          {firstEnt && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
              <InfoCell label="CONTRACT NAME" value={firstEnt.contract_name} />
              <InfoCell label="ENT ID" value={<code style={{ fontSize: 13 }}>{firstEnt.ent_id.replace("-", "–")}</code>} />
              <InfoCell label="UTIL %" value={firstEnt.util_pct != null ? `${firstEnt.util_pct}%` : "—"} />
              <InfoCell label="ENTITLED" value={firstEnt.entitled_count?.toLocaleString()} />
              <InfoCell label="IN-USE" value={firstEnt.in_use_count?.toLocaleString()} />
              <InfoCell label="EXPIRY" value={firstEnt.end_date || "—"} />
              <InfoCell label="PO NUMBER" value={firstEnt.po_number} />
              <InfoCell label="CLM ID" value={firstEnt.clm_id} />
              <InfoCell label="ANNUAL COST" value={fmtINR(firstEnt.annual_cost_inr)} />
            </div>
          )}

          {/* Full-width fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginBottom: 10 }}>
            {firstEnt?.metric_name && <InfoCell label="METRIC" value={firstEnt.metric_name} />}
            {d.app_owner_name && (
              <div style={{ background: "var(--surf)", borderRadius: 6, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx-q)", letterSpacing: 0.5, marginBottom: 8 }}>APP OWNER</div>
                <Avatar initials={d.app_owner_initials} name={d.app_owner_name} />
              </div>
            )}
            {d.notes && <InfoCell label="NOTES / BUSINESS DESCRIPTION" value={d.notes} />}
            {d.onboarded_date && (
              <InfoCell label="ONBOARDED DATE" value={new Date(d.onboarded_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} />
            )}
          </div>

          {/* Contract history */}
          {d.entitlements?.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx-q)", letterSpacing: 0.5, textTransform: "uppercase", margin: "14px 0 10px" }}>
                Contract History (S3 Archive)
              </div>
              {d.entitlements.map(ent => (
                <div key={ent.ent_id} style={{ display: "flex", gap: 12, marginBottom: 12, padding: "10px 12px", background: "var(--surf)", borderRadius: 6 }}>
                  <div style={{ fontSize: 24, flexShrink: 0 }}>{ent.is_archived ? "📦" : "📄"}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>
                      {ent.contract_name || `${d.canonical_name} — Contract`}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--tx-m)" }}>
                      {ent.start_date && `Start: ${ent.start_date}`}
                      {ent.end_date && ` · Expiry: ${ent.end_date}`}
                      {" · "}
                      {ent.is_archived ? (
                        <span style={{ color: "var(--tx-q)", fontWeight: 600 }}>Archived</span>
                      ) : (
                        <span style={{ color: "var(--teal-m)", fontWeight: 600 }}>Active</span>
                      )}
                    </div>
                    {ent.is_archived && ent.archived_path && (
                      <div style={{ fontSize: 11, color: "var(--tx-q)", marginTop: 2 }}>
                        Archived to S3 on renewal · Access via AWS Console
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Aliases */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx-q)", letterSpacing: 0.5, textTransform: "uppercase", margin: "14px 0 8px" }}>
            Aliases ({d.aliases?.length || 0})
          </div>
          {d.aliases?.map(a => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "4px 0", borderBottom: "1px solid var(--bdr)" }}>
              <span>{a.alias_name}</span>
              <button style={{ background: "none", border: "none", color: "var(--red-m)", cursor: "pointer", fontSize: 12 }} onClick={() => handleDeleteAlias(a.id)}>✕</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input className="fi2" style={{ flex: 1, fontSize: 12 }} placeholder="Add alias…" value={aliasInput} onChange={e => setAliasInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddAlias()} />
            <button className="btn btn-p btn-sm" onClick={handleAddAlias}>+</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CatalogPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterGxp, setFilterGxp] = useState("");
  const [filterOwner, setFilterOwner] = useState("");
  const [categories, setCategories] = useState([]);
  const [selectedSwId, setSelectedSwId] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {});
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (filterCategory) params.category_id = filterCategory;
      if (filterGxp) params.gxp_flag = filterGxp;
      setRows(await fetchCatalogRows(params));
    } finally {
      setLoading(false);
    }
  }, [search, filterCategory, filterGxp]);

  useEffect(() => { reload(); }, [reload]);

  // Unique app owners derived from loaded rows (client-side filter)
  const ownerOptions = [...new Set(rows.map(r => r.app_owner_name).filter(Boolean))].sort();
  const displayRows = filterOwner ? rows.filter(r => r.app_owner_name === filterOwner) : rows;

  const COLS = [
    { key: "sw_id",           label: "SW_ID",          width: 80 },
    { key: "canonical_name",  label: "Software Name",  width: 180 },
    { key: "publisher",       label: "Publisher",      width: 130 },
    { key: "category_name",   label: "Category",       width: 150 },
    { key: "sub_category_name",label:"Sub-Category",   width: 120 },
    { key: "gxp_flag",        label: "GxP",            width: 80  },
    { key: "vendor_risk",     label: "Vendor Risk",    width: 90  },
    { key: "license_type",    label: "License Model",  width: 120 },
    { key: "metric_name",     label: "Metric",         width: 100 },
    { key: "deployment",      label: "Deploy",         width: 110 },
    { key: "region_name",     label: "Region",         width: 80  },
    { key: "app_owner_name",  label: "App Owner",      width: 130 },
    { key: "onboarded_date",  label: "Onboarded Date", width: 110 },
    { key: "notes",           label: "Notes",          width: 200 },
    { key: "action",          label: "Action",         width: 80  },
  ];

  return (
    <div style={{ display: "flex", height: "calc(100vh - 52px)", overflow: "hidden" }}>

      {/* ── Main panel ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: "18px 22px 0" }}>

        {/* Header */}
        <div style={{ flexShrink: 0, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--tx-q)", marginBottom: 4 }}>SAM Platform <span style={{ color: "var(--tx-m)" }}>›</span> Software Catalog</div>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 2 }}>Software Catalog</h1>
          <p style={{ fontSize: 12.5, color: "var(--tx-m)" }}>{displayRows.length} software titles · canonical master list · onboarded by COE Admin</p>
        </div>

        {/* Filter + action bar — single line, no wrap */}
        <div style={{ flexShrink: 0, display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
          <input
            ref={searchRef}
            className="fi2" style={{ flex: 1, minWidth: 0 }}
            placeholder="Search SW_ID, software name, publisher…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
          <select className="fi2" style={{ flexShrink: 0 }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="fi2" style={{ flexShrink: 0 }} value={filterGxp} onChange={e => setFilterGxp(e.target.value)}>
            <option value="">All (GxP)</option>
            <option value="yes">GxP</option>
            <option value="no">Non-GxP</option>
          </select>
          <select className="fi2" style={{ flexShrink: 0 }} value={filterOwner} onChange={e => setFilterOwner(e.target.value)}>
            <option value="">All App Owners</option>
            {ownerOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <button className="btn btn-p btn-sm" style={{ flexShrink: 0, background: "var(--navy-mid)", whiteSpace: "nowrap" }} onClick={() => window.location.href = "/onboarding"}>
            + Onboard New
          </button>
        </div>

        {/* Table — scrollable section */}
        <div style={{ flex: 1, overflow: "auto", borderRadius: 8, border: "1px solid var(--bdr)", marginBottom: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1400 }}>
            <thead>
              <tr style={{ background: "var(--surf)" }}>
                {COLS.map(col => (
                  <th key={col.key} style={{
                    position: "sticky", top: 0, zIndex: 2,
                    background: "var(--surf)", borderBottom: "2px solid var(--bdr)",
                    padding: "8px 12px", fontSize: 10, fontWeight: 700,
                    color: "var(--tx-q)", textTransform: "uppercase", letterSpacing: 0.5,
                    whiteSpace: "nowrap", textAlign: "left",
                    minWidth: col.width, width: col.width,
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
                <tr><td colSpan={COLS.length} style={{ textAlign: "center", padding: 24, color: "var(--tx-q)" }}>No software entries found.</td></tr>
              )}
              {displayRows.map(row => (
                <tr
                  key={row.sw_id}
                  style={{ borderBottom: "1px solid var(--bdr)", background: selectedSwId === row.sw_id ? "var(--navy-xlt)" : undefined }}
                >
                  <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                    <code style={{ fontSize: 11, background: "var(--bg2)", padding: "2px 5px", borderRadius: 3 }}>{row.sw_id}</code>
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{row.canonical_name}</div>
                  </td>
                  <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--tx-m)", whiteSpace: "nowrap" }}>{row.publisher || "—"}</td>
                  <td style={{ padding: "9px 12px", fontSize: 12, whiteSpace: "nowrap" }}>{row.category_name || "—"}</td>
                  <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--tx-m)", whiteSpace: "nowrap" }}>{row.sub_category_name || "—"}</td>
                  <td style={{ padding: "9px 12px" }}><GxpBadge flag={row.gxp_flag} /></td>
                  <td style={{ padding: "9px 12px" }}>{RISK_BADGE[row.vendor_risk] ?? row.vendor_risk}</td>
                  <td style={{ padding: "9px 12px" }}>{row.license_type ? TYPE_BADGE[row.license_type] : <span style={{ color: "var(--tx-q)", fontSize: 11 }}>—</span>}</td>
                  <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--tx-m)", whiteSpace: "nowrap" }}>{row.metric_name || "—"}</td>
                  <td style={{ padding: "9px 12px" }}>
                    {row.deployment ? (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: "var(--blue-l)", color: "var(--blue-m)" }}>
                        {DEPLOY_LABEL[row.deployment] || row.deployment}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--tx-m)", whiteSpace: "nowrap" }}>{row.region_name || "—"}</td>
                  <td style={{ padding: "9px 12px" }}>
                    {row.app_owner_name ? <Avatar initials={row.app_owner_initials} name={row.app_owner_name} /> : <span style={{ color: "var(--tx-q)", fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--tx-m)", whiteSpace: "nowrap" }}>
                    {row.onboarded_date ? new Date(row.onboarded_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                  </td>
                  <td style={{ padding: "9px 12px", fontSize: 11.5, color: "var(--tx-m)", maxWidth: 200 }}>
                    <div style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {row.notes || "—"}
                    </div>
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <button
                      className="btn btn-o btn-sm"
                      style={{ whiteSpace: "nowrap" }}
                      onClick={() => setSelectedSwId(selectedSwId === row.sw_id ? null : row.sw_id)}
                    >
                      View →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Detail drawer ────────────────────────────────────────────────── */}
      {selectedSwId && (
        <DetailDrawer swId={selectedSwId} onClose={() => setSelectedSwId(null)} />
      )}
    </div>
  );
}
