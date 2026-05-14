import { useState, useEffect, useCallback } from "react";
import { fetchOwners, createOwner, deactivateOwner, fetchDOA, createDOA, deleteDOA } from "../../api/owners";

const TIER_BADGE = {
  "1": <span className="doa">Tier 1</span>,
  "2": <span className="doa" style={{ background: "var(--teal-m)" }}>Tier 2</span>,
};

function initials(name) {
  return (name || "?").split(" ").map(w => w[0] || "").join("").slice(0, 2).toUpperCase();
}

export default function AppOwnersPage() {
  const [owners, setOwners] = useState([]);
  const [doa, setDOA] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showOwnerForm, setShowOwnerForm] = useState(false);
  const [ownerForm, setOwnerForm] = useState({ email: "", full_name: "", password: "", bu: "" });

  const [showDOAForm, setShowDOAForm] = useState(false);
  const [doaForm, setDOAForm] = useState({ user_id: "", tier: "2", role_label: "", alert_scope: "" });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [o, d] = await Promise.all([fetchOwners(), fetchDOA()]);
      setOwners(o);
      setDOA(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleAddOwner = async () => {
    if (!ownerForm.email || !ownerForm.full_name || !ownerForm.password) return;
    await createOwner(ownerForm);
    setOwnerForm({ email: "", full_name: "", password: "", bu: "" });
    setShowOwnerForm(false);
    reload();
  };

  const handleAddDOA = async () => {
    if (!doaForm.user_id) return;
    await createDOA({ ...doaForm, role_label: doaForm.role_label || null, alert_scope: doaForm.alert_scope || null });
    setDOAForm({ user_id: "", tier: "2", role_label: "", alert_scope: "" });
    setShowDOAForm(false);
    reload();
  };

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> App Owners</div>
        <h1>Application Owner Registry</h1>
        <p>DOA Escalation Hierarchy · Application Owners · Admin CRUD enabled</p>
      </div>

      {/* ── DOA Escalation Hierarchy ───────────────────────────────────────── */}
      <div className="sdiv">DOA Escalation Hierarchy</div>

      <div className="sr">
        <button className="btn btn-p btn-sm" onClick={() => setShowDOAForm(v => !v)}>+ Add DOA Contact</button>
      </div>

      {showDOAForm && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div className="fr3">
            <div className="fg">
              <label className="fl">User <span className="req">*</span></label>
              <select className="fi2" value={doaForm.user_id} onChange={e => setDOAForm(f => ({ ...f, user_id: e.target.value }))}>
                <option value="">Select app owner…</option>
                {owners.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
              </select>
              <div className="fhint">User must be an App Owner. Create them below first if needed.</div>
            </div>
            <div className="fg">
              <label className="fl">Tier</label>
              <select className="fi2" value={doaForm.tier} onChange={e => setDOAForm(f => ({ ...f, tier: e.target.value }))}>
                <option value="1">Tier 1 — CIO / COE Head</option>
                <option value="2">Tier 2 — Procurement / Other</option>
              </select>
            </div>
            <div className="fg">
              <label className="fl">Role Label</label>
              <input className="fi2" value={doaForm.role_label} onChange={e => setDOAForm(f => ({ ...f, role_label: e.target.value }))} placeholder="e.g. CIO · Tier 1" />
            </div>
          </div>
          <div className="fg">
            <label className="fl">Alert Scope</label>
            <input className="fi2" value={doaForm.alert_scope} onChange={e => setDOAForm(f => ({ ...f, alert_scope: e.target.value }))} placeholder="e.g. All · T-30+ · GxP" />
          </div>
          <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
            <button className="btn btn-p btn-sm" onClick={handleAddDOA}>Save DOA Contact</button>
            <button className="btn btn-o btn-sm" onClick={() => setShowDOAForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="tw">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>BU</th><th>Tier / Role</th><th>Alert Scope</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="6" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {doa.map(d => (
              <tr key={d.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--navy-mid)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                      {initials(d.user.full_name)}
                    </div>
                    <strong>{d.user.full_name}</strong>
                  </div>
                </td>
                <td style={{ fontSize: 11.5 }}>{d.user.email}</td>
                <td>{d.user.bu || "—"}</td>
                <td>
                  {TIER_BADGE[d.tier]}
                  {d.role_label && <span style={{ fontSize: 11, color: "var(--tx-m)", marginLeft: 6 }}>{d.role_label}</span>}
                </td>
                <td style={{ fontSize: 11, color: "var(--tx-m)" }}>{d.alert_scope || "—"}</td>
                <td>
                  <div className="crud-actions">
                    <button className="btn btn-d btn-sm" onClick={async () => {
                      if (!window.confirm("Remove from DOA hierarchy?")) return;
                      await deleteDOA(d.id);
                      reload();
                    }}>Remove</button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && doa.length === 0 && (
              <tr><td colSpan="6" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>No DOA contacts yet — add one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Application Owners ─────────────────────────────────────────────── */}
      <div className="sdiv">Application Owners</div>

      <div className="sr">
        <button className="btn btn-p btn-sm" onClick={() => setShowOwnerForm(v => !v)}>+ Add App Owner</button>
      </div>

      {showOwnerForm && (
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div className="fr3">
            <div className="fg">
              <label className="fl">Full Name <span className="req">*</span></label>
              <input className="fi2" value={ownerForm.full_name} onChange={e => setOwnerForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. J. Williams" />
            </div>
            <div className="fg">
              <label className="fl">Email <span className="req">*</span></label>
              <input className="fi2" type="email" value={ownerForm.email} onChange={e => setOwnerForm(f => ({ ...f, email: e.target.value }))} placeholder="j.williams@drl.com" />
            </div>
            <div className="fg">
              <label className="fl">BU / Dept</label>
              <input className="fi2" value={ownerForm.bu} onChange={e => setOwnerForm(f => ({ ...f, bu: e.target.value }))} placeholder="e.g. IT Ops" />
            </div>
          </div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Temporary Password <span className="req">*</span></label>
              <input className="fi2" type="password" value={ownerForm.password} onChange={e => setOwnerForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button className="btn btn-p btn-sm" onClick={handleAddOwner}>Save App Owner</button>
            <button className="btn btn-o btn-sm" onClick={() => setShowOwnerForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="tw">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>BU / Dept</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="5" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>Loading…</td></tr>}
            {owners.map(o => (
              <tr key={o.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--navy-mid)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                      {initials(o.full_name)}
                    </div>
                    <strong>{o.full_name}</strong>
                  </div>
                </td>
                <td style={{ fontSize: 11.5 }}>{o.email}</td>
                <td>{o.bu || "—"}</td>
                <td>{o.is_active ? <span className="tag tg2">Active</span> : <span className="tag tgr2">Inactive</span>}</td>
                <td>
                  <div className="crud-actions">
                    <button className="btn btn-d btn-sm" onClick={async () => {
                      if (!window.confirm(`Deactivate ${o.full_name}? They will lose platform access.`)) return;
                      await deactivateOwner(o.id);
                      reload();
                    }}>Deactivate</button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && owners.length === 0 && (
              <tr><td colSpan="5" style={{ textAlign: "center", padding: 18, color: "var(--tx-q)" }}>No app owners yet — add one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
