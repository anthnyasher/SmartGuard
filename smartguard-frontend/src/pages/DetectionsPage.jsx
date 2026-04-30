// src/pages/DetectionsPage.jsx
// ── CHANGE FROM ORIGINAL: NAV_ITEMS only — all tabs now functional: true ──────
// Everything else in this file is identical to your working version.
import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getCameras } from "../api/cameraApi.js";
import { useAllDetections } from "../hooks/useAllDetections.js";
import "./AdminDashboard.css";
import "./DetectionsPage.css";

// ── Nav ────────────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "dashboard",  label: "Dashboard",          icon: "⊞", path: "/admin",            functional: true },
  { id: "live",       label: "Live Monitoring",     icon: "◉", path: "/admin/live",       functional: true },
  { id: "detections", label: "Detections & Alerts", icon: "✦", path: "/admin/detections", functional: true },
  { id: "evidence",   label: "Evidence Vault",      icon: "🔒", path: "/admin/evidence",   functional: true },
  { id: "cameras",    label: "Cameras",             icon: "📷", path: "/admin/cameras",    functional: true },
  { id: "logs",       label: "Logs",                icon: "📋", path: "/admin/logs",       functional: true },
  { id: "access",     label: "Access Control",      icon: "🔑", path: "/admin/access",     functional: true },
  { id: "settings",   label: "Settings",            icon: "⚙",  path: "/admin/settings",   functional: true },
];

const SEVERITY_CONFIG = {
  CRITICAL: { color: "#ef4444", bg: "rgba(239,68,68,0.12)",  label: "CRITICAL" },
  HIGH:     { color: "#f97316", bg: "rgba(249,115,22,0.12)", label: "HIGH"     },
  MEDIUM:   { color: "#eab308", bg: "rgba(234,179,8,0.12)",  label: "MEDIUM"   },
  LOW:      { color: "#3b82f6", bg: "rgba(59,130,246,0.12)", label: "LOW"      },
};

function formatTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d)) return "—";
  
  const now = new Date();
  const isToday = d.getDate() === now.getDate() && 
                  d.getMonth() === now.getMonth() && 
                  d.getFullYear() === now.getFullYear();
                  
  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  
  if (isToday) return `Today, ${timeStr}`;
  
  const dateStr = d.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dateStr}, ${timeStr}`;
}

function SeverityBadge({ severity }) {
  const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.HIGH;
  return (
    <span className="dp-severity"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}40` }}>
      {cfg.label}
    </span>
  );
}

function SnapshotModal({ event, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const cfg = SEVERITY_CONFIG[event.severity] ?? SEVERITY_CONFIG.HIGH;
  return (
    <div className="dp-snap-overlay" onClick={onClose}>
      <div className="dp-snap-modal" onClick={e => e.stopPropagation()}>
        <div className="dp-snap-header" style={{ borderColor: cfg.color }}>
          <div className="dp-snap-title-row">
            <SeverityBadge severity={event.severity} />
            <h3 className="dp-snap-title">Behavior Detection</h3>
          </div>
          <button className="dp-snap-close" onClick={onClose}>✕</button>
        </div>
        <div className="dp-snap-body">
          {event.frame_jpg_b64 ? (
            <img className="dp-snap-img" src={`data:image/jpeg;base64,${event.frame_jpg_b64}`} alt="Detection snapshot" />
          ) : (
            <div className="dp-snap-noframe">
              <span style={{ fontSize: 48 }}>🎞</span>
              <span>No snapshot available</span>
            </div>
          )}
        </div>
        <div className="dp-snap-footer">
          <div className="dp-snap-detail">
            <span className="dp-snap-label">Camera</span>
            <span className="dp-snap-value">{event.camera_name ?? `ID ${event.camera_id}`}</span>
          </div>
          <div className="dp-snap-detail">
            <span className="dp-snap-label">Confidence</span>
            <span className="dp-snap-value" style={{ color: cfg.color }}>
              {event.confidence != null ? `${Math.round(event.confidence * 100)}%` : "—"}
            </span>
          </div>
          <div className="dp-snap-detail">
            <span className="dp-snap-label">Time</span>
            <span className="dp-snap-value">{formatTime(event.timestamp)}</span>
          </div>
          <div className="dp-snap-detail">
            <span className="dp-snap-label">Alert ID</span>
            <span className="dp-snap-value">{event.alert_id ?? "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedRow({ event, index, onViewSnapshot }) {
  const cfg = SEVERITY_CONFIG[event.severity] ?? SEVERITY_CONFIG.HIGH;
  const isNew = index === 0;
  return (
    <div className={`dp-row${isNew ? " dp-row--new" : ""}`} style={{ "--sev-color": cfg.color }}>
      <div className="dp-row-indicator" style={{ background: cfg.color }} />
      <div className="dp-row-main">
        <div className="dp-row-top">
          <SeverityBadge severity={event.severity} />
          <span className="dp-row-behavior">{event.behavior_type ?? "—"}</span>
          {event.status && (
            <span className={`dp-status-badge dp-status-${event.status.toLowerCase()}`}>
              {event.status.replace("_", " ")}
            </span>
          )}
          {isNew && <span className="dp-row-live-badge">● LIVE</span>}
        </div>
        <div className="dp-row-bottom">
          <span className="dp-row-camera">📷 {event.camera_name ?? `Camera ${event.camera_id}`}</span>
          <span className="dp-row-conf">
            {event.confidence != null ? `${Math.round(event.confidence * 100)}% confidence` : ""}
          </span>
          <span className="dp-row-time">{formatTime(event.timestamp)}</span>
        </div>
      </div>
      <button className="dp-row-snap-btn" onClick={() => onViewSnapshot(event)} title="View snapshot">
        {event.frame_jpg_b64 ? (
          <img className="dp-row-thumb" src={`data:image/jpeg;base64,${event.frame_jpg_b64}`} alt="snapshot" />
        ) : (
          <span className="dp-row-no-thumb">🎞</span>
        )}
        <span className="dp-row-snap-label">View</span>
      </button>
    </div>
  );
}

function DetectionsPage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [cameras, setCameras]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [paused, setPaused]             = useState(false);
  const [historicalFeed, setHistoricalFeed] = useState([]);

  const loadCameras = useCallback(async () => {
    if (!token) return;
    try {
      const cams = await getCameras(token);
      setCameras(Array.isArray(cams) ? cams : []);
    } catch (e) {
      console.error("Failed to load cameras", e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadCameras(); }, [loadCameras]);

  const loadExistingAlerts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("http://localhost:8000/api/alerts/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const alerts = Array.isArray(data) ? data : (data.results ?? []);
      const shaped = alerts.slice(0, 50).map(a => ({
        camera_id:      a.camera,
        camera_name:    a.camera_name ?? `Camera ${a.camera}`,
        behavior_type:  a.behavior_type,
        confidence:     a.confidence,
        severity:       a.severity,
        alert_id:       a.id,
        timestamp:      a.created_at,
        status:         a.status,
        frame_jpg_b64:  a.frame_jpg_b64 ?? null,
        receivedAt:     new Date(a.created_at).getTime(),
      }));
      setHistoricalFeed(shaped);
    } catch (e) {
      console.error("Failed to load existing alerts", e);
    }
  }, [token]);

  useEffect(() => { loadExistingAlerts(); }, [loadExistingAlerts]);

  const { feed, connectedIds } = useAllDetections(paused ? [] : cameras, token);
  const handleLogout = () => { logout(); navigate("/login", { replace: true }); };

  const mergedFeed = [
    ...feed,
    ...historicalFeed.filter(h => !feed.some(f => f.alert_id && f.alert_id === h.alert_id)),
  ];

  const filteredFeed = severityFilter === "ALL"
    ? mergedFeed
    : mergedFeed.filter(e => e.severity === severityFilter);

  const critCount = mergedFeed.filter(e => e.severity === "CRITICAL").length;
  const highCount = mergedFeed.filter(e => e.severity === "HIGH").length;
  const connCount = connectedIds.size;

  return (
    <div className="sg-layout">
      <aside className={`sg-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sg-sidebar-logo">
          <div className="sg-logo-icon">🛡</div>
          {!sidebarCollapsed && (
            <span className="sg-logo-text">
              <span className="sg-logo-smart">SMART</span>
              <span className="sg-logo-guard">GUARD</span>
            </span>
          )}
        </div>
        <nav className="sg-sidebar-nav">
          {NAV_ITEMS.map(item => (
            <Link key={item.id} to={item.path}
              className={`sg-nav-item${item.id === "detections" ? " sg-nav-active" : ""}`}>
              <span className="sg-nav-icon">{item.icon}</span>
              {!sidebarCollapsed && <span className="sg-nav-label">{item.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="sg-sidebar-footer">
          <div className="sg-user-row">
            <div className="sg-user-avatar">{user?.email?.[0]?.toUpperCase() || "A"}</div>
            {!sidebarCollapsed && (
              <div className="sg-user-info">
                <div className="sg-user-name">{user?.email}</div>
                <div className="sg-user-role">{user?.role}</div>
              </div>
            )}
          </div>
          {!sidebarCollapsed && <button className="sg-logout-btn" onClick={handleLogout}>Logout</button>}
        </div>
      </aside>

      <div className="sg-main">
        <header className="sg-topbar">
          <div className="sg-topbar-left">
            <button className="sg-collapse-btn" onClick={() => setSidebarCollapsed(p => !p)}>☰</button>
            <div className="sg-breadcrumb">
              <span className="sg-breadcrumb-root">Dashboard</span>
              <span className="sg-breadcrumb-sep">›</span>
              <span className="sg-breadcrumb-current">Detections & Alerts</span>
            </div>
          </div>
          <div className="sg-topbar-right">
            <div className={`dp-ws-status ${connCount > 0 ? "dp-ws-status--on" : "dp-ws-status--off"}`}>
              <span className="dp-ws-dot" />
              {connCount > 0 ? `${connCount} camera${connCount !== 1 ? "s" : ""} live` : "Disconnected"}
            </div>
          </div>
        </header>

        <div className="sg-content">
          <div className="dp-page-header">
            <div>
              <h1 className="sg-page-title">Detections & Alerts</h1>
              <p className="dp-subtitle">Real-time AI behavior detection feed</p>
            </div>
            <div className="dp-kpi-strip">
              <div className="dp-kpi">
                <span className="dp-kpi-val">{mergedFeed.length}</span>
                <span className="dp-kpi-label">Total</span>
              </div>
              <div className="dp-kpi dp-kpi--critical">
                <span className="dp-kpi-val">{critCount}</span>
                <span className="dp-kpi-label">Critical</span>
              </div>
              <div className="dp-kpi dp-kpi--high">
                <span className="dp-kpi-val">{highCount}</span>
                <span className="dp-kpi-label">High</span>
              </div>
            </div>
          </div>

          <section className="sg-card dp-feed-card">
            <div className="dp-toolbar">
              <div className="dp-filters">
                {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map(sev => (
                  <button key={sev}
                    className={`dp-filter-btn${severityFilter === sev ? " dp-filter-btn--active" : ""}`}
                    onClick={() => setSeverityFilter(sev)} data-sev={sev.toLowerCase()}>
                    {sev}
                  </button>
                ))}
              </div>
              <div className="dp-toolbar-right">
                <button className={`dp-pause-btn${paused ? " dp-pause-btn--paused" : ""}`}
                  onClick={() => setPaused(p => !p)}>
                  {paused ? "▶ Resume" : "⏸ Pause"}
                </button>
                {mergedFeed.length > 0 && (
                  <span className="dp-feed-count">{filteredFeed.length} event{filteredFeed.length !== 1 ? "s" : ""}</span>
                )}
              </div>
            </div>

            <div className="dp-feed">
              {loading ? (
                <div className="sg-loading"><div className="sg-spinner" /> Connecting to cameras...</div>
              ) : cameras.length === 0 ? (
                <div className="dp-empty">
                  <span style={{ fontSize: 40 }}>📷</span>
                  <span>No cameras configured.</span>
                  <Link to="/admin/cameras" className="dp-empty-link">Go to Camera Management →</Link>
                </div>
              ) : filteredFeed.length === 0 ? (
                <div className="dp-empty">
                  <span style={{ fontSize: 40 }}>✦</span>
                  <span className="dp-empty-title">
                    {paused ? "Feed paused" : "Monitoring — no detections yet"}
                  </span>
                  <span className="dp-empty-sub">
                    {paused
                      ? "Press Resume to continue receiving live events."
                      : `Watching ${connCount} camera${connCount !== 1 ? "s" : ""}. Events will appear here in real time.`}
                  </span>
                </div>
              ) : (
                <div className="dp-feed-list">
                  {filteredFeed.map((event, i) => (
                    <FeedRow key={`${event.camera_id}-${event.timestamp}-${i}`}
                      event={event} index={i} onViewSnapshot={setSelectedEvent} />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {selectedEvent && (
        <SnapshotModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}

export default DetectionsPage;