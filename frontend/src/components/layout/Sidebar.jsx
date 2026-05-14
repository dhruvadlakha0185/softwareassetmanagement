import { useNavigate, useLocation } from "react-router-dom";

const SECTIONS = [
  {
    label: "Overview",
    items: [
      { path: "/", label: "Dashboard" },
      { path: "/cost-opt", label: "Cost Optimisation", badge: "₹2.4Cr", badgeCls: "sb-g" },
    ],
  },
  {
    label: "Catalog & Licensing",
    items: [
      { path: "/catalog", label: "Software Catalog" },
      { path: "/entitlements", label: "Entitlements", badge: "8 Exp.", badgeCls: "sb-a" },
      { path: "/discovery", label: "License Discovery" },
      { path: "/reconciliation", label: "Reconciliation", badge: "3 Risk", badgeCls: "sb-r" },
      { path: "/onboarding", label: "Onboard Software" },
    ],
  },
  {
    label: "Governance",
    items: [
      { path: "/audit", label: "Audit Trail" },
      { path: "/alerts", label: "Alerts & Nudges", badge: "7", badgeCls: "sb-r" },
      { path: "/owners", label: "App Owners" },
    ],
  },
  {
    label: "Configuration",
    items: [{ path: "/masters", label: "Masters & Config" }],
  },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="sidebar">
      <div className="sb-scroll">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="sb-sec">{section.label}</div>
            {section.items.map((item) => (
              <button
                key={item.path}
                className={`sn${location.pathname === item.path ? " active" : ""}`}
                onClick={() => navigate(item.path)}
              >
                {item.label}
                {item.badge && (
                  <span className={`sb-badge ${item.badgeCls}`}>{item.badge}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="sb-footer">
        <div className="sb-version">SAM Platform v3.0 · DRL IT COE · 2026</div>
      </div>
    </div>
  );
}
