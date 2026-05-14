import { useState, useEffect, useCallback } from "react";
import { fetchAlerts, markAlertRead } from "../../api/alerts";
import useAlertStore from "../../store/alertStore";

const SEVERITY_COLOR = {
  CRITICAL: { bg: "#fff0f0", border: "#e53e3e", badge: "tgr2" },
  HIGH:     { bg: "#fffaf0", border: "#dd6b20", badge: "tg4" },
  MEDIUM:   { bg: "#fffff0", border: "#d69e2e", badge: "tg4" },
  INFO:     { bg: "var(--navy-xlt)", border: "var(--navy-mid)", badge: "tg1" },
};

const TYPE_LABEL = { RENEWAL: "Renewal", UTILISATION: "Utilisation" };

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { fetchUnreadCount } = useAlertStore();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterType) params.alert_type = filterType;
      if (filterSeverity) params.severity = filterSeverity;
      if (unreadOnly) params.unread_only = true;
      setAlerts(await fetchAlerts(params));
    } finally {
      setLoading(false);
    }
  }, [filterType, filterSeverity, unreadOnly]);

  useEffect(() => { reload(); }, [reload]);

  const handleMarkRead = async (alertId) => {
    await markAlertRead(alertId);
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_read: true } : a));
    fetchUnreadCount();
  };

  const handleMarkAllRead = async () => {
    const unread = alerts.filter(a => !a.is_read);
    await Promise.all(unread.map(a => markAlertRead(a.id)));
    setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
    fetchUnreadCount();
  };

  const unreadCount = alerts.filter(a => !a.is_read).length;

  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> Alerts &amp; Nudges</div>
        <h1>Alerts &amp; Notifications</h1>
        <p>{alerts.length} alerts · {unreadCount} unread</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <select className="fi2" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          <option value="RENEWAL">Renewal</option>
          <option value="UTILISATION">Utilisation</option>
        </select>
        <select className="fi2" value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
          <option value="">All Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="INFO">Info</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} />
          Unread only
        </label>
        <div style={{ flex: 1 }} />
        {unreadCount > 0 && (
          <button className="btn btn-o btn-sm" onClick={handleMarkAllRead}>Mark all as read</button>
        )}
      </div>

      {loading && <div style={{ color: "var(--tx-q)", fontSize: 13 }}>Loading…</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {alerts.map(a => {
          const sc = SEVERITY_COLOR[a.severity] || SEVERITY_COLOR.INFO;
          return (
            <div
              key={a.id}
              style={{
                background: a.is_read ? "var(--surf)" : sc.bg,
                border: `1px solid ${a.is_read ? "var(--bdr)" : sc.border}`,
                borderRadius: 8, padding: "12px 16px",
                opacity: a.is_read ? 0.7 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className={`tag ${sc.badge}`}>{a.severity}</span>
                  <span className="tag tg3">{TYPE_LABEL[a.alert_type] || a.alert_type}</span>
                  {a.is_gxp && <span className="tag tg1">GxP</span>}
                  <strong style={{ fontSize: 13 }}>{a.title}</strong>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, marginLeft: 12 }}>
                  <span style={{ fontSize: 11, color: "var(--tx-q)" }}>
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                  {!a.is_read && (
                    <button className="btn btn-o btn-sm" onClick={() => handleMarkRead(a.id)}>
                      Mark read
                    </button>
                  )}
                </div>
              </div>

              {a.body_json && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--tx-m)", display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {a.body_json.ent_id && <span><strong>ENT:</strong> {a.body_json.ent_id}</span>}
                  {a.body_json.sw_name && <span><strong>SW:</strong> {a.body_json.sw_name}</span>}
                  {a.body_json.end_date && <span><strong>Expires:</strong> {a.body_json.end_date}</span>}
                  {a.body_json.util_pct !== undefined && <span><strong>Util:</strong> {a.body_json.util_pct}%</span>}
                  {a.body_json.entitled !== undefined && <span><strong>Entitled:</strong> {a.body_json.entitled}</span>}
                  {a.body_json.in_use !== undefined && <span><strong>In Use:</strong> {a.body_json.in_use}</span>}
                </div>
              )}
            </div>
          );
        })}
        {!loading && alerts.length === 0 && (
          <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 8, padding: 24, textAlign: "center", color: "var(--tx-q)" }}>
            No alerts. Run reconciliation or wait for the daily scheduler to generate alerts.
          </div>
        )}
      </div>
    </div>
  );
}
