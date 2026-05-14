import { useNavigate, useLocation } from "react-router-dom";
import useAuthStore from "../../store/authStore";
import useAlertStore from "../../store/alertStore";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard" },
  { path: "/catalog", label: "Catalog" },
  { path: "/entitlements", label: "Entitlements" },
  { path: "/discovery", label: "Discovery" },
  { path: "/onboarding", label: "Onboard" },
  { path: "/reconciliation", label: "Reconciliation" },
  { path: "/cost-opt", label: "Cost Opt." },
  { path: "/audit", label: "Audit Trail" },
  { path: "/alerts", label: "Alerts" },
  { path: "/owners", label: "App Owners" },
  { path: "/masters", label: "Masters" },
];

const ROLE_LABELS = {
  COE_ADMIN: "COE ADMIN",
  APP_OWNER: "APP OWNER",
  READ_ONLY: "READ ONLY",
};

export default function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { unreadCount } = useAlertStore();

  const initials = user
    ? user.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "??";

  return (
    <div className="topbar">
      <div className="tb-brand">
        <div className="tb-dot">DRL</div>
        <div>
          <div className="tb-brand-text">SAM Platform</div>
          <div className="tb-brand-sub">Software Asset Management · v3.0</div>
        </div>
      </div>

      <div className="tb-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            className={`tn${location.pathname === item.path ? " active" : ""}`}
            onClick={() => navigate(item.path)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="tb-right">
        {user && (
          <span className="role-badge">{ROLE_LABELS[user.role] ?? user.role}</span>
        )}
        <button className="nb" onClick={() => navigate("/alerts")} title="Alerts">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M7 1.5a3.5 3.5 0 013.5 3.5v2.5l1.25 1.75H2.25L3.5 7.5V5A3.5 3.5 0 017 1.5z" />
            <path d="M5.5 11.5a1.5 1.5 0 003 0" />
          </svg>
          {unreadCount > 0 && <div className="nd" />}
        </button>
        <div
          className="av"
          title={`${user?.email ?? ""} — click to sign out`}
          style={{ cursor: "pointer" }}
          onClick={logout}
        >
          {initials}
        </div>
      </div>
    </div>
  );
}
