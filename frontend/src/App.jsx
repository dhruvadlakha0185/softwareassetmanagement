import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import AppLayout from "./components/layout/AppLayout";
import PrivateRoute from "./components/shared/PrivateRoute";
import LoginPage from "./pages/Login/LoginPage";
import DashboardPage from "./pages/Dashboard/DashboardPage";
import CatalogPage from "./pages/Catalog/CatalogPage";
import EntitlementsPage from "./pages/Entitlements/EntitlementsPage";
import DiscoveryPage from "./pages/Discovery/DiscoveryPage";
import OnboardingPage from "./pages/Onboarding/OnboardingPage";
import ReconciliationPage from "./pages/Reconciliation/ReconciliationPage";
import CostOptPage from "./pages/CostOpt/CostOptPage";
import AuditTrailPage from "./pages/AuditTrail/AuditTrailPage";
import AlertsPage from "./pages/Alerts/AlertsPage";
import AppOwnersPage from "./pages/AppOwners/AppOwnersPage";
import MastersPage from "./pages/Masters/MastersPage";
import useAuthStore from "./store/authStore";
import useAlertStore from "./store/alertStore";

function AuthInit({ children }) {
  const { token, user, fetchMe } = useAuthStore();
  const { fetchUnreadCount } = useAlertStore();

  useEffect(() => {
    if (token && !user) fetchMe();
  }, [token, user, fetchMe]);

  // Poll alert count every 60 s while authenticated
  useEffect(() => {
    if (!token) return;
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60_000);
    return () => clearInterval(interval);
  }, [token, fetchUnreadCount]);

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthInit>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            element={
              <PrivateRoute>
                <AppLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="entitlements" element={<EntitlementsPage />} />
            <Route path="discovery" element={<DiscoveryPage />} />
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route path="reconciliation" element={<ReconciliationPage />} />
            <Route path="cost-opt" element={<CostOptPage />} />
            <Route path="audit" element={<AuditTrailPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="owners" element={<AppOwnersPage />} />
            <Route path="masters" element={<MastersPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthInit>
    </BrowserRouter>
  );
}
