import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { fetchDashboardSummary } from "../../api/dashboard";
import { fetchScorecard } from "../../api/costOpt";
import useAuthStore from "../../store/authStore";

function useSidebarStats() {
  const [stats, setStats] = useState(null);
  const { token } = useAuthStore();

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [summary, scorecard] = await Promise.all([
        fetchDashboardSummary(),
        fetchScorecard(),
      ]);
      setStats({ summary, scorecard });
    } catch {
      // silently fail — badges just stay blank
    }
  }, [token]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  return stats;
}

function formatCr(inr) {
  if (!inr || inr === 0) return null;
  const cr = inr / 10_000_000;
  return cr >= 0.1 ? `₹${cr.toFixed(1)}Cr` : null;
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const stats = useSidebarStats();

  const s = stats?.summary || {};
  const sc = stats?.scorecard || {};

  // Derive each badge — return null to hide the badge entirely
  const costOptBadge   = formatCr(sc.total_est_saving_inr);
  const entBadge       = s.expiring_30d_count > 0 ? `${s.expiring_30d_count} Exp.` : null;
  const reconBadge     = s.over_deployed_count > 0 ? `${s.over_deployed_count} Risk` : null;
  const alertBadge     = s.unread_alerts_count > 0 ? `${s.unread_alerts_count}` : null;

  const SECTIONS = [
    {
      label: "Overview",
      items: [
        { path: "/", label: "Dashboard" },
        { path: "/cost-opt", label: "Cost Optimisation", badge: costOptBadge, badgeCls: "sb-g" },
      ],
    },
    {
      label: "Catalog & Licensing",
      items: [
        { path: "/catalog", label: "Software Catalog" },
        { path: "/entitlements", label: "Entitlements", badge: entBadge, badgeCls: "sb-a" },
        { path: "/discovery", label: "License Discovery" },
        { path: "/reconciliation", label: "Reconciliation", badge: reconBadge, badgeCls: "sb-r" },
        { path: "/onboarding", label: "Onboard Software" },
      ],
    },
    {
      label: "Governance",
      items: [
        { path: "/audit", label: "Audit Trail" },
        { path: "/alerts", label: "Alerts & Nudges", badge: alertBadge, badgeCls: "sb-r" },
        { path: "/owners", label: "App Owners" },
      ],
    },
    {
      label: "Configuration",
      items: [{ path: "/masters", label: "Masters & Config" }],
    },
  ];

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
