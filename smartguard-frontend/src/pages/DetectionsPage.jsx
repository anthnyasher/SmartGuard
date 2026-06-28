import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import useDocumentTitle from "../utils/useDocumentTitle.js";
import AlertsManager from "./AlertsManager.jsx";
import "./AdminDashboard.css";
import "./DetectionsPage.css";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "⊞", path: "/admin" },
  { id: "live", label: "Live Monitoring", icon: "◉", path: "/admin/live" },
  { id: "detections", label: "Detections & Alerts", icon: "✦", path: "/admin/detections" },
  { id: "evidence", label: "Evidence Vault", icon: "🔒", path: "/admin/evidence" },
  { id: "incidents", label: "Incident Response", icon: "📋", path: "/admin/incidents" },
  { id: "cameras", label: "Cameras", icon: "📷", path: "/admin/cameras" },
  { id: "logs", label: "Logs", icon: "📑", path: "/admin/logs" },
  { id: "access", label: "Access Control", icon: "🔑", path: "/admin/access" },
  { id: "settings", label: "Settings", icon: "⚙", path: "/admin/settings" },
];

export default function DetectionsPage() {
  useDocumentTitle("Detections & Alerts");
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth <= 768);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="sg-layout">
      {/* Sidebar */}
      <aside className={`sg-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sg-sidebar-logo">
          {!sidebarCollapsed && (
            <>
              <div className="sg-logo-mark">SG</div>
              <div className="sg-logo-text">SmartGuard</div>
            </>
          )}
          {sidebarCollapsed && <div className="sg-logo-mark">SG</div>}
        </div>
        <nav className="sg-sidebar-nav">
          {NAV_ITEMS.map(item => (
            <Link key={item.id} to={item.path}
              className={`sg-nav-item ${item.id === "detections" ? "active" : ""}`}
              title={sidebarCollapsed ? item.label : undefined}>
              <span className="sg-nav-icon">{item.icon}</span>
              {!sidebarCollapsed && <span className="sg-nav-label">{item.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="sg-sidebar-footer">
          <div className="sg-user-info">
            <div className="sg-avatar">{user?.username?.[0]?.toUpperCase() || "A"}</div>
            {!sidebarCollapsed && (
              <div className="sg-user-details">
                <span className="sg-user-name">{user?.username || "Admin"}</span>
                <span className="sg-user-role">{user?.role || "System Admin"}</span>
              </div>
            )}
          </div>
          {!sidebarCollapsed && <button className="sg-logout-btn" onClick={handleLogout}>Logout</button>}
        </div>
      </aside>

      {/* Main Content */}
      <main className="sg-main">
        <header className="sg-topbar">
          <div className="sg-topbar-left">
            <button className="sg-collapse-btn" onClick={() => setSidebarCollapsed(p => !p)}>☰</button>
            <div>
              <h1 className="sg-page-title">Detections & Alerts</h1>
              <p className="sg-page-subtitle">Real-time AI behavior detection feed</p>
            </div>
          </div>
          <div className="sg-topbar-right">
            <button className="sg-btn sg-btn--outline">⚙ Configure Rules</button>
            <button className="sg-btn sg-btn--primary">Export Report</button>
          </div>
        </header>
        
        <div className="sg-content">
          {/* We now use the advanced AlertsManager UI here instead of the basic feed */}
          <AlertsManager />
        </div>
      </main>
    </div>
  );
}
