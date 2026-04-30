// src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import OpsDashboard from "./pages/OpsDashboard.jsx";
import OpsLivePage from "./pages/OpsLivePage.jsx";
import OpsAlertsPage from "./pages/OpsAlertPage.jsx";
import { OpsEvidencePage } from "./pages/OpsLivePage.jsx";
import StaffDashboard from "./pages/StaffDashboard.jsx";
import LiveMonitoring from "./pages/LiveMonitoring.jsx";
import CameraManagement from "./pages/CameraManagement";
import DetectionsPage from "./pages/DetectionsPage.jsx";
import LogsPage from "./pages/LogsPage.jsx";
import EvidenceVault from "./pages/EvidenceVault.jsx";
import AccessControl from "./pages/AccessControl.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";

function RequireAuth({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Route to correct dashboard instead of kicking to login
    if (user.role === "ADMIN")       return <Navigate to="/admin/dashboard" replace />;
    if (user.role === "OPS_MANAGER") return <Navigate to="/ops/dashboard"   replace />;
    if (user.role === "STAFF")       return <Navigate to="/staff/dashboard"  replace />;
    return <Navigate to="/login" replace />;
  }
  return children;
}

const OPS_ROLES   = ["OPS_MANAGER", "ADMIN"];
const STAFF_ROLES = ["STAFF", "OPS_MANAGER", "ADMIN"];
const ADMIN_ROLES = ["ADMIN"];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* ── Admin routes ────────────────────────────────────────────────── */}
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
      {[
        { path: "/admin/dashboard",  element: <AdminDashboard /> },
        { path: "/admin/live",       element: <LiveMonitoring />  },
        { path: "/admin/detections", element: <DetectionsPage />  },
        { path: "/admin/evidence",   element: <EvidenceVault />   },
        { path: "/admin/cameras",    element: <CameraManagement />},
        { path: "/admin/logs",       element: <LogsPage />        },
        { path: "/admin/access",     element: <AccessControl />   },
        { path: "/admin/settings",   element: <SettingsPage />    },
      ].map(({ path, element }) => (
        <Route key={path} path={path}
          element={<RequireAuth allowedRoles={ADMIN_ROLES}>{element}</RequireAuth>}
        />
      ))}

      {/* ── Ops Manager routes ──────────────────────────────────────────── */}
      <Route path="/ops" element={<Navigate to="/ops/dashboard" replace />} />
      {[
        { path: "/ops/dashboard", element: <OpsDashboard /> },
        { path: "/ops/live",      element: <OpsLivePage />  },
        { path: "/ops/alerts",    element: <OpsAlertsPage />},
        { path: "/ops/evidence",  element: <OpsEvidencePage />},
      ].map(({ path, element }) => (
        <Route key={path} path={path}
          element={<RequireAuth allowedRoles={OPS_ROLES}>{element}</RequireAuth>}
        />
      ))}

      {/* ── Staff routes ────────────────────────────────────────────────── */}
      <Route path="/staff/dashboard"
        element={<RequireAuth allowedRoles={STAFF_ROLES}><StaffDashboard /></RequireAuth>}
      />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}