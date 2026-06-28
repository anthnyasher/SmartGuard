// src/pages/OpsLayout.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared sidebar + topbar layout for all Ops Manager pages.
// Import and wrap page content:
//   <OpsLayout active="alerts" title="My Alerts">
//     {content}
//   </OpsLayout>
// ─────────────────────────────────────────────────────────────────────────────
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import "./AdminDashboard.css";

export const OPS_NAV = [
  { id: "dashboard", label: "Dashboard",       icon: "⊞", path: "/ops/dashboard" },
  { id: "live",      label: "Live Monitoring", icon: "◉", path: "/ops/live"      },
  { id: "alerts",    label: "Alerts & Events", icon: "✦", path: "/ops/alerts"    },
  { id: "evidence",  label: "Evidence Vault",  icon: "🔒", path: "/ops/evidence"  },
];

export const STAFF_NAV = [
  { id: "alerts",    label: "Alerts",          icon: "✦", path: "/staff/dashboard" },
  { id: "live",      label: "Live Monitoring", icon: "◉", path: "/staff/live"      },
];

export default function OpsLayout({
  active,
  title,
  subtitle,
  topbarRight,
  children,
  sidebarCollapsed,
  onToggleSidebar,
}) {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const handleLogout     = () => { logout(); navigate("/login", { replace: true }); };

  const ROLE_DISPLAY = {
    ADMIN: "Administrator", OPS_MANAGER: "Operations Manager",
    OPS: "Operations Manager", STAFF: "Store Staff",
  };

  const navItems = user?.role === "STAFF" ? STAFF_NAV : OPS_NAV;
  const roleDisplay = ROLE_DISPLAY[user?.role] || user?.role;

  return (
    <div className="sg-layout">
      {/* Sidebar */}
      <aside className={`sg-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sg-sidebar-logo">
          <img src="/favicon.png" alt="Logo" className="sg-logo-icon" style={{ width: "24px", height: "24px", objectFit: "contain" }} />
          {!sidebarCollapsed && (
            <span className="sg-logo-text">
              <span className="sg-logo-smart">SMART</span>
              <span className="sg-logo-guard">GUARD</span>
            </span>
          )}
        </div>
        <nav className="sg-sidebar-nav">
          {navItems.map(item => (
            <Link key={item.id} to={item.path}
              className={`sg-nav-item${item.id === active ? " sg-nav-active" : ""}`}>
              <span className="sg-nav-icon">{item.icon}</span>
              {!sidebarCollapsed && <span className="sg-nav-label">{item.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="sg-sidebar-footer">
          <div className="sg-user-row">
            <div className="sg-user-avatar">{user?.email?.[0]?.toUpperCase() || "U"}</div>
            {!sidebarCollapsed && (
              <div className="sg-user-info">
                <div className="sg-user-name">{user?.email}</div>
                <div className="sg-user-role">{roleDisplay}</div>
              </div>
            )}
          </div>

          {!sidebarCollapsed && <button className="sg-logout-btn" onClick={handleLogout}>Logout</button>}
        </div>
      </aside>

      {/* Main */}
      <div className="sg-main">
        <header className="sg-topbar">
          <div className="sg-topbar-left">
            <button className="sg-collapse-btn" onClick={onToggleSidebar}>☰</button>
            <div className="sg-breadcrumb">
              <span className="sg-breadcrumb-root">Operations</span>
              <span className="sg-breadcrumb-sep">›</span>
              <span className="sg-breadcrumb-current">{title}</span>
            </div>
          </div>
          {topbarRight && <div className="sg-topbar-right">{topbarRight}</div>}
        </header>

        <div className="sg-content">
          {title && (
            <div style={{ marginBottom: 20 }}>
              <h1 className="sg-page-title">{title}</h1>
              {subtitle && <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>{subtitle}</p>}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
