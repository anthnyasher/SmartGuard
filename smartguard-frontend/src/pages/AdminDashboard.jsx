// src/pages/AdminDashboard.jsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getCameras } from "../api/cameraApi.js";
import { getAlerts } from "../api/alertApi.js";
import "./AdminDashboard.css";

const NAV_ITEMS = [
  { id: "dashboard",  label: "Dashboard",          icon: "⊞", path: "/admin"            },
  { id: "live",       label: "Live Monitoring",     icon: "◉", path: "/admin/live"       },
  { id: "detections", label: "Detections & Alerts", icon: "✦", path: "/admin/detections" },
  { id: "evidence",   label: "Evidence Vault",      icon: "🔒", path: "/admin/evidence"   },
  { id: "cameras",    label: "Cameras",             icon: "📷", path: "/admin/cameras"    },
  { id: "logs",       label: "Logs",                icon: "📋", path: "/admin/logs"       },
  { id: "access",     label: "Access Control",      icon: "🔑", path: "/admin/access"     },
  { id: "settings",   label: "Settings",            icon: "⚙",  path: "/admin/settings"   },
];

function DetectionChart() {
  const points = [2, 5, 3, 8, 4, 6, 10, 7, 4, 3, 6, 9];
  const max = Math.max(...points);
  const h = 80, w = 260, step = w / (points.length - 1);
  const coords = points.map((v, i) => `${i * step},${h - (v / max) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="detection-chart" preserveAspectRatio="none">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-blue)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${coords} ${w},${h}`} fill="url(#chartGrad)" />
      <polyline points={coords} fill="none" stroke="var(--accent-blue)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function SeverityDonut({ counts }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const colors = { CRITICAL: "#dc2626", HIGH: "#ea580c", MEDIUM: "#b45309", LOW: "#16a34a" };
  let offset = 0;
  const r = 36, circ = 2 * Math.PI * r;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 100 100" className="donut-svg">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth="14" />
        {Object.entries(counts).map(([key, val]) => {
          const pct = val / total;
          const el = (
            <circle key={key} cx="50" cy="50" r={r} fill="none"
              stroke={colors[key]} strokeWidth="14"
              strokeDasharray={`${pct * circ} ${circ - pct * circ}`}
              strokeDashoffset={-offset * circ}
              style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
            />
          );
          offset += pct;
          return el;
        })}
        <text x="50" y="46" textAnchor="middle" className="donut-pct">
          {Math.round(((counts.CRITICAL || 0) / total) * 100)}%
        </text>
        <text x="50" y="58" textAnchor="middle" className="donut-label">Critical</text>
      </svg>
      <div className="donut-legend">
        {Object.entries(colors).map(([key, color]) => (
          <div key={key} className="donut-legend-row">
            <span className="donut-dot" style={{ background: color }} />
            <span className="donut-legend-label">{key}</span>
            <span className="donut-legend-val">{counts[key] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminDashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [cameraCount, setCameraCount]       = useState(0);
  const [onlineCount, setOnlineCount]       = useState(0);
  const [activeAlerts, setActiveAlerts]     = useState(0);
  const [todayAlerts, setTodayAlerts]       = useState(0);
  const [recentAlerts, setRecentAlerts]     = useState([]);
  const [severityCounts, setSeverityCounts] = useState({ CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 });
  const [loading, setLoading]               = useState(true);
  const [searchQuery, setSearchQuery]       = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // TODO: Replace with GET /api/incidents/?status=OPEN
  const placeholderIncidents = [
    { id: "INC-0042", time: "01:30 PM", camera: "CAM-12", severity: "CRITICAL", status: "OPEN" },
    { id: "INC-0041", time: "10:34 AM", camera: "CAM-01", severity: "HIGH",     status: "UNDER_INVESTIGATION" },
  ];

  // TODO: Replace with GET /api/evidence/?limit=3
  const placeholderEvidence = [
    { timestamp: "01:30 PM", camera: "Entrance — Zone A",  incident: "INC-0042", size: "28.7 MB", verified: true  },
    { timestamp: "10:34 AM", camera: "Aisle 2 — Zone GF", incident: "INC-0041", size: "14.2 MB", verified: true  },
  ];

  // TODO: Replace with GET /api/cameras/activity/?period=24h
  const topCameras = [
    { name: "Entrance — Zone A",   count: 15 },
    { name: "Aisle 2 — Zone GF",   count: 9  },
    { name: "Checkout — Zone GF",  count: 7  },
  ];

  useEffect(() => {
    if (!token) return;
    async function loadData() {
      try {
        const [cams, alerts] = await Promise.all([getCameras(token), getAlerts(token)]);
        const camList   = Array.isArray(cams)   ? cams   : [];
        const alertList = Array.isArray(alerts) ? alerts : [];
        const online    = camList.filter(c => ["ONLINE","online"].includes(c.status)).length;
        const unreviewed = alertList.filter(a => a.status === "NEW").length;
        const today     = alertList.filter(a => {
          const d = new Date(a.created_at), n = new Date();
          return d.toDateString() === n.toDateString();
        }).length;
        const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
        alertList.forEach(a => { if (counts[a.severity] !== undefined) counts[a.severity]++; });
        setCameraCount(camList.length);
        setOnlineCount(online);
        setActiveAlerts(unreviewed);
        setTodayAlerts(today);
        setRecentAlerts(alertList.slice(0, 6));
        setSeverityCounts(counts);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [token]);

  const handleLogout = () => { logout(); navigate("/login", { replace: true }); };
  const cameraPercent = cameraCount > 0 ? (onlineCount / cameraCount) * 100 : 0;

  const STATUS_LABELS = {
  NEW: "New", ESCALATED: "Escalated", FALSE_POSITIVE: "False Positive", CLOSED: "Closed",
};
  const INCIDENT_LABELS = {
    OPEN: "Open", UNDER_INVESTIGATION: "Under Investigation", MITIGATED: "Mitigated", CLOSED: "Closed",
  };

  return (
    <div className="sg-layout">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
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
              className={`sg-nav-item${item.id === "dashboard" ? " sg-nav-active" : ""}`}
            >
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

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="sg-main">
        <header className="sg-topbar">
          <div className="sg-topbar-left">
            <button className="sg-collapse-btn" onClick={() => setSidebarCollapsed(p => !p)}>☰</button>
            <div className="sg-breadcrumb">
              <span className="sg-breadcrumb-root">Dashboard</span>
              <span className="sg-breadcrumb-sep">›</span>
              <span className="sg-breadcrumb-current">Home</span>
            </div>
          </div>
          <div className="sg-topbar-center">
            <div className="sg-search-wrap">
              <span className="sg-search-icon">🔍</span>
              <input className="sg-search" placeholder="Search alerts, cameras, or incidents..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
          </div>
          <div className="sg-topbar-right">
            <button className="sg-icon-btn" title="Notifications">
              🔔<span className="sg-icon-badge">1</span>
            </button>
            {/* TODO: Wire to GET /api/reports/dashboard/?format=pdf */}
            <button className="sg-pdf-btn" onClick={() => alert("TODO: Export dashboard report")}>
              ⬇ Download PDF
            </button>
          </div>
        </header>

        <div className="sg-content">
          <h1 className="sg-page-title">Dashboard</h1>

          {/* KPI strip */}
          <div className="sg-kpi-strip">
            <div className="sg-kpi kpi-red">
              <div className="sg-kpi-icon-wrap kpi-icon-red">⚑</div>
              <div>
                <div className="sg-kpi-val">{loading ? "—" : activeAlerts}</div>
                <div className="sg-kpi-label">Unreviewed Alerts</div>
              </div>
            </div>
            <div className="sg-kpi kpi-green">
              <div className="sg-kpi-icon-wrap kpi-icon-green">📷</div>
              <div>
                <div className="sg-kpi-val">
                  {loading ? "—" : `${onlineCount}/${cameraCount || 19}`}
                  {!loading && onlineCount === (cameraCount || 19) && <span className="sg-kpi-check">✓</span>}
                </div>
                <div className="sg-kpi-label">Cameras Online</div>
              </div>
            </div>
            <div className="sg-kpi kpi-amber">
              <div className="sg-kpi-icon-wrap kpi-icon-amber">⚠</div>
              <div>
                {/* TODO: Replace with GET /api/incidents/?status=OPEN count */}
                <div className="sg-kpi-val">2</div>
                <div className="sg-kpi-label">Open Incidents</div>
              </div>
            </div>
            <div className="sg-kpi kpi-blue">
              <div className="sg-kpi-icon-wrap kpi-icon-blue">✦</div>
              <div>
                <div className="sg-kpi-val">
                  {loading ? "—" : todayAlerts}
                  {!loading && <span className="sg-kpi-delta sg-kpi-delta-up">↑ Today</span>}
                </div>
                <div className="sg-kpi-label">Detections</div>
              </div>
            </div>
            <div className="sg-kpi kpi-purple">
              <div className="sg-kpi-icon-wrap kpi-icon-purple">🔒</div>
              <div>
                {/* TODO: Replace with GET /api/logs/?type=FAILED_LOGIN&period=24h count */}
                <div className="sg-kpi-val">3</div>
                <div className="sg-kpi-label">Failed Logins (24h)</div>
              </div>
            </div>
          </div>

          {/* Main grid */}
          <div className="sg-grid">
            <div className="sg-col-left">

              {/* Live Alerts */}
              <section className="sg-card">
                <div className="sg-card-header">
                  <h2 className="sg-card-title">Live Alerts</h2>
                  <Link to="/admin/detections" className="sg-view-all-btn">View All →</Link>
                </div>
                {loading ? (
                  <div className="sg-loading"><div className="sg-spinner" /> Loading alerts...</div>
                ) : recentAlerts.length === 0 ? (
                  <div className="sg-empty">No alerts recorded yet.</div>
                ) : (
                  <div className="sg-table-wrap">
                    <table className="sg-table">
                      <thead>
                        <tr>
                            <th>Time</th><th>Camera</th><th>Behavior</th>
                            <th>Confidence</th><th>Severity</th><th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentAlerts.map(alert => (
                          <tr key={alert.id}>
                            <td className="sg-td-mono">
                              {new Date(alert.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="sg-td-bold">
                              {alert.camera_name || `Camera ${alert.camera}`}
                            </td>
                            <td>{alert.behavior_type}</td>
                            <td className="sg-td-mono">
                              {alert.confidence != null ? `${Math.round(alert.confidence * 100)}%` : "—"}
                            </td>
                            <td><span className={`sg-chip sg-sev-${alert.severity}`}>{alert.severity}</span></td>
                            <td>
                              <span className={`sg-chip sg-stat-${alert.status}`}>
                                {STATUS_LABELS[alert.status] || alert.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Incident Summary */}
              <section className="sg-card">
                <div className="sg-card-header">
                  <h2 className="sg-card-title">Incident Summary</h2>
                  {/* TODO: Link to /admin/incidents when built */}
                  <button className="sg-view-all-btn">View All →</button>
                </div>
                <div className="sg-table-wrap">
                  <table className="sg-table">
                    <thead>
                      <tr><th>Time</th><th>Incident ID</th><th>Camera</th><th>Severity</th><th>Status</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {placeholderIncidents.map(inc => (
                        <tr key={inc.id}>
                          <td className="sg-td-mono">{inc.time}</td>
                          <td className="sg-td-bold">{inc.id}</td>
                          <td>{inc.camera}</td>
                          <td><span className={`sg-chip sg-sev-${inc.severity}`}>{inc.severity}</span></td>
                          <td>
                            <span className={`sg-chip sg-stat-${inc.status}`}>
                              {INCIDENT_LABELS[inc.status] || inc.status}
                            </span>
                          </td>
                          <td>
                            <button className="sg-action-btn">View →</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Recent Evidence */}
              <section className="sg-card">
                <div className="sg-card-header">
                  <h2 className="sg-card-title">Recent Evidence</h2>
                  <Link to="/admin/evidence" className="sg-view-all-btn">View All →</Link>
                </div>
                <div className="sg-table-wrap">
                  <table className="sg-table">
                    <thead>
                      <tr><th>Time</th><th>Camera</th><th>Incident</th><th>Size</th><th>Integrity</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {placeholderEvidence.map((ev, i) => (
                        <tr key={i}>
                          <td className="sg-td-mono">{ev.timestamp}</td>
                          <td className="sg-td-bold">{ev.camera}</td>
                          <td>{ev.incident}</td>
                          <td>{ev.size}</td>
                          <td>
                            <span className={`sg-chip ${ev.verified ? "sg-stat-REVIEWED" : "sg-stat-ESCALATED"}`}>
                              {ev.verified ? "✓ Verified" : "⚠ Unverified"}
                            </span>
                          </td>
                          <td>
                            <button className="sg-action-btn" onClick={() => navigate("/admin/evidence")}>View</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

            </div>

            {/* Right column */}
            <div className="sg-col-right">

              <section className="sg-card">
                <div className="sg-card-header">
                  <h2 className="sg-card-title">AI Detection Analytics</h2>
                  <Link to="/admin/detections" className="sg-view-all-btn">View All →</Link>
                </div>
                <div className="sg-analytics-label">
                  Detections Over Time <span className="sg-analytics-sub">(Last 24 Hours)</span>
                </div>
                <div className="sg-chart-row">
                  <div className="sg-chart-wrap">
                    <DetectionChart />
                    <div className="sg-chart-xaxis">
                      {["4h ago", "3h", "2h", "1h", "Now"].map(l => <span key={l}>{l}</span>)}
                    </div>
                  </div>
                  <SeverityDonut counts={severityCounts} />
                </div>
                <div className="sg-top-cameras-row">
                  <div className="sg-top-cam-block">
                    <div className="sg-top-cam-title">MOST ACTIVE</div>
                    {topCameras.slice(0, 2).map(c => (
                      <div key={c.name} className="sg-top-cam-row">
                        <span className="sg-top-cam-dot" />
                        <span className="sg-top-cam-name">{c.name}</span>
                        <Link to="/admin/live" className="sg-action-btn" style={{ textDecoration: "none" }}>View</Link>
                      </div>
                    ))}
                  </div>
                  <div className="sg-top-cam-block">
                    <div className="sg-top-cam-title">ACTIVITY BY CAMERA</div>
                    {topCameras.map(c => (
                      <div key={c.name} className="sg-top-cam-bar-row">
                        <span className="sg-top-cam-name">{c.name}</span>
                        <div className="sg-top-cam-bar-track">
                          <div className="sg-top-cam-bar-fill" style={{ width: `${(c.count / 15) * 100}%` }} />
                        </div>
                        <span className="sg-top-cam-count">{c.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="sg-card">
                <div className="sg-card-header">
                  <h2 className="sg-card-title">Camera Status</h2>
                  <Link to="/admin/cameras" className="sg-view-all-btn">Manage →</Link>
                </div>
                <div className="sg-cam-ratio">
                  {onlineCount} <span className="sg-cam-ratio-total">/ {cameraCount || 19}</span>
                </div>
                <div className="sg-cam-bar-track">
                  <div className="sg-cam-bar-fill" style={{ width: `${cameraPercent}%` }} />
                </div>
                <div className="sg-cam-sub">
                  {cameraPercent.toFixed(0)}% online · {(cameraCount || 19) - onlineCount} offline
                </div>
                <p className="sg-placeholder-note"></p>
              </section>

              <section className="sg-card">
                <div className="sg-card-header">
                  <h2 className="sg-card-title">System Health</h2>
                </div>
                {/* TODO: Replace with GET /api/system/health/ */}
                {[
                  { label: "CPU Usage",           val: "—",       pct: 0    },
                  { label: "Memory Usage",         val: "—",       pct: 0    },
                  { label: "Storage",              val: "—",       pct: 0    },
                  { label: "AI Detection Engine",  val: "Running", ok: true  },
                  { label: "Alert Queue",          val: "Active",  ok: true  },
                ].map(row => (
                  <div key={row.label} className="sg-health-row">
                    <span className="sg-health-label">{row.label}</span>
                    {row.pct !== undefined ? (
                      <div className="sg-health-bar-wrap">
                        <div className="sg-health-bar-track">
                          <div className="sg-health-bar-fill" style={{ width: `${row.pct}%` }} />
                        </div>
                        <span className="sg-health-val">{row.val}</span>
                      </div>
                    ) : (
                      <span className={`sg-health-val ${row.ok ? "sg-health-ok" : "sg-health-err"}`}>
                        {row.ok ? "● " : "○ "}{row.val}
                      </span>
                    )}
                  </div>
                ))}
                <p className="sg-placeholder-note">Live health data — connect to system health API.</p>
              </section>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;