// src/pages/OpsDashboard.jsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getAlerts } from "../api/alertApi.js";
import "./AdminDashboard.css";
import "./shared-components.css";
import "./OpsDashboard.css";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard",       icon: "⊞", path: "/ops"          },
  { id: "live",      label: "Live Monitoring", icon: "◉", path: "/ops/live"     },
  { id: "alerts",    label: "Alerts",          icon: "✦", path: "/ops/alerts"   },
  { id: "evidence",  label: "Evidence",        icon: "🎞", path: "/ops/evidence" },
];

const ASSIGNED_ZONES = [
  { id: "cam-01", name: "Entrance — Zone A",       status: "ONLINE"  },
  { id: "cam-02", name: "Exit — Zone A",           status: "ONLINE"  },
  { id: "cam-03", name: "Aisle 1 — Zone GF",       status: "ONLINE"  },
  { id: "cam-04", name: "Aisle 2 — Zone GF",       status: "OFFLINE" },
  { id: "cam-05", name: "Self-Checkout — Zone GF", status: "ONLINE"  },
  { id: "cam-06", name: "Customer Service",         status: "ONLINE"  },
];

const SAMPLE_INCIDENTS = [
  { id: "INC-0042", time: "02:15 PM", camera_name: "Aisle 1 — Zone GF",       severity: "CRITICAL", status: "OPEN",                description: "Shoplifting detected with high confidence" },
  { id: "INC-0041", time: "01:30 PM", camera_name: "Self-Checkout — Zone GF", severity: "HIGH",     status: "UNDER_INVESTIGATION", description: "Concealment behavior — under review"      },
];

const STATUS_LABELS   = { NEW: "New", ESCALATED: "Escalated", FALSE_POSITIVE: "False Positive", CLOSED: "Closed" };
const INCIDENT_LABELS = { OPEN: "Open", UNDER_INVESTIGATION: "Under Investigation", MITIGATED: "Mitigated", CLOSED: "Closed" };

function Sparkline({ points, color = "#2563eb" }) {
  const max = Math.max(...points, 1);
  const h = 50, w = 200, step = w / (points.length - 1);
  const coords = points.map((v, i) => `${i * step},${h - (v / max) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 50 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="ops-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${coords} ${w},${h}`} fill="url(#ops-g)" />
      <polyline points={coords} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function NotesModal({ alert, onSave, onClose }) {
  const [note, setNote] = useState(alert.notes || "");
  const camName = alert.camera?.name || alert.camera_name || `Camera ${alert.camera}` || "N/A";
  const timeStr = new Date(alert.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="ops-modal-overlay" onClick={onClose}>
      <div className="ops-modal" onClick={e => e.stopPropagation()}>
        <div className="ops-modal-header">
          <h3 className="ops-modal-title">Add Note — #{alert.id}</h3>
          <button className="lm-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="ops-modal-body">
          <div style={{ marginBottom: 10 }}>
            <span className={`sg-chip sg-sev-${alert.severity}`}>{alert.severity}</span>
            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)" }}>{camName} · {timeStr}</span>
          </div>
          <textarea className="ops-note-input" placeholder="Add your observation here..."
            value={note} onChange={e => setNote(e.target.value)} rows={4} />
        </div>
        <div className="ops-modal-footer">
          <button className="det-btn-full det-btn-full--primary" onClick={() => onSave(note)}>Save Note</button>
          <button className="det-btn-full det-btn-full--ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function OpsDashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [alerts, setAlerts]                     = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [statusFilter, setStatusFilter]         = useState("ALL");
  const [noteModal, setNoteModal]               = useState(null);

  // ── YOUR ORIGINAL FETCH LOGIC — preserved exactly ────────────────────────────
  useEffect(() => {
    async function fetchAlerts() {
      try {
        const data = await getAlerts(token);
        const filtered = Array.isArray(data) ? data : [];
        setAlerts(filtered);
      } catch (err) {
        console.error("Failed to load ops alerts", err);
        setAlerts([]);
      } finally {
        setLoading(false);
      }
    }
    if (token) { fetchAlerts(); }
  }, [token]);

  const handleLogout = () => { logout(); navigate("/login", { replace: true }); };

  // Per spec: OPS can mark Reviewed, Escalated, or False Positive
  const updateStatus = (id, newStatus) => {
    // TODO: PATCH /api/alerts/<id>/ { status: newStatus }
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
  };

  const saveNote = (id, note) => {
    // TODO: PATCH /api/alerts/<id>/ { notes: note }
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, notes: note } : a));
    setNoteModal(null);
  };

  const countByStatus = {
  NEW:            alerts.filter(a => a.status === "NEW").length,
  ESCALATED:      alerts.filter(a => a.status === "ESCALATED").length,
  FALSE_POSITIVE: alerts.filter(a => a.status === "FALSE_POSITIVE").length,
  CLOSED:         alerts.filter(a => a.status === "CLOSED").length,
};

  const displayed   = statusFilter === "ALL" ? alerts : alerts.filter(a => a.status === statusFilter);
  const onlineCams  = ASSIGNED_ZONES.filter(z => z.status === "ONLINE").length;
  const offlineCams = ASSIGNED_ZONES.filter(z => z.status === "OFFLINE").length;

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
              className={`sg-nav-item${item.id === "dashboard" ? " sg-nav-active" : ""}`}>
              <span className="sg-nav-icon">{item.icon}</span>
              {!sidebarCollapsed && <span className="sg-nav-label">{item.label}</span>}
              {!sidebarCollapsed && item.id === "alerts" && countByStatus.NEW > 0 && (
                <span className="sg-nav-badge">{countByStatus.NEW}</span>
              )}
            </Link>
          ))}
        </nav>
        {!sidebarCollapsed && (
          <div className="ops-zone-panel">
            <div className="ops-zone-title">MY ASSIGNED ZONES</div>
            {ASSIGNED_ZONES.map(z => (
              <div key={z.id} className="ops-zone-row">
                <span className={`ops-zone-dot ops-zone-dot--${z.status.toLowerCase()}`} />
                <span className="ops-zone-name">{z.name}</span>
              </div>
            ))}
          </div>
        )}
        <div className="sg-sidebar-footer">
          <div className="sg-user-row">
            <div className="sg-user-avatar">{user?.email?.[0]?.toUpperCase() || "O"}</div>
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
              <span className="sg-breadcrumb-root">Operations</span>
              <span className="sg-breadcrumb-sep">›</span>
              <span className="sg-breadcrumb-current">Dashboard</span>
            </div>
          </div>
          <div className="sg-topbar-right">
            <div className="ops-zone-chip">
              <span>📍</span>
              <span>Zone A + Zone GF · {onlineCams}/{ASSIGNED_ZONES.length} cameras online</span>
            </div>
            <Link to="/ops/live" className="sg-pdf-btn" style={{ textDecoration: "none" }}>◉ Live View</Link>
          </div>
        </header>

        <div className="sg-content">
          <div style={{ marginBottom: 20 }}>
            <h1 className="sg-page-title">Operations Dashboard</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>
              Showing alerts for your assigned zones only
            </p>
          </div>

          <div className="ops-kpi-strip">
            {[
              { key: "ALL",            label: "Total Alerts",   val: alerts.length,               icon: "✦", cls: "ops-kpi--blue"  },
              { key: "NEW",            label: "New",            val: countByStatus.NEW,            icon: "⚑", cls: "ops-kpi--red"   },
              { key: "ESCALATED",      label: "Escalated",      val: countByStatus.ESCALATED,      icon: "↑", cls: "ops-kpi--amber" },
              { key: "FALSE_POSITIVE", label: "False Positive", val: countByStatus.FALSE_POSITIVE, icon: "✕", cls: "ops-kpi--gray"  },
              { key: "CLOSED",         label: "Closed",         val: countByStatus.CLOSED,         icon: "✓", cls: "ops-kpi--green" },
            ].map(k => (
              <button key={k.key}
                className={`ops-kpi ${k.cls}${statusFilter === k.key ? " ops-kpi--active" : ""}`}
                onClick={() => setStatusFilter(k.key)}>
                <span className="ops-kpi-icon">{k.icon}</span>
                <div>
                  <div className="ops-kpi-val">{k.val}</div>
                  <div className="ops-kpi-label">{k.label}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="ops-grid">
            <div className="ops-col-main">
              <section className="sg-card">
                <div className="sg-card-header">
                  <h2 className="sg-card-title">
                    Active / New Alerts
                    {statusFilter !== "ALL" && (
                      <span className={`sg-chip sg-stat-${statusFilter}`} style={{ marginLeft: 8, fontSize: 10 }}>
                        {STATUS_LABELS[statusFilter]}
                      </span>
                    )}
                  </h2>
                  <span className="det-count-label">{displayed.length} alert{displayed.length !== 1 ? "s" : ""}</span>
                </div>
                {loading ? (
                  <div className="sg-loading"><div className="sg-spinner" /> Loading alerts...</div>
                ) : displayed.length === 0 ? (
                  <div className="sg-empty" style={{ padding: "40px 24px" }}>No active or new alerts at the moment.</div>
                ) : (
                  <div className="sg-table-wrap">
                    <table className="sg-table">
                      <thead>
                        <tr>
                          <th>TIME</th><th>CAMERA</th><th>TYPE</th><th>CONFIDENCE</th>
                          <th>SEVERITY</th><th>STATUS</th><th>ASSIGNED TO</th><th>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayed.map(alert => {
                          const camName = alert.camera?.name || alert.camera_name || alert.camera || "N/A";
                          const timeStr = new Date(alert.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                          const conf    = alert.confidence != null ? Math.round(alert.confidence * 100) : null;
                          return (
                            <tr key={alert.id}>
                              <td className="sg-td-mono">{timeStr}</td>
                              <td>
                                <div className="det-cam-cell">
                                  <span className="det-cam-id">#{alert.id}</span>
                                  <span className="det-cam-name">{camName}</span>
                                </div>
                              </td>
                              <td className="sg-td-bold">{alert.behavior_type}</td>
                              <td>
                                {conf !== null ? (
                                  <div className="det-conf-wrap">
                                    <div className="det-conf-bar-track">
                                      <div className="det-conf-bar-fill" style={{
                                        width: `${conf}%`,
                                        background: conf >= 85 ? "#dc2626" : conf >= 70 ? "#ea580c" : "#2563eb",
                                      }} />
                                    </div>
                                    <span className="det-conf-val">{conf}%</span>
                                  </div>
                                ) : "—"}
                              </td>
                              <td><span className={`sg-chip sg-sev-${alert.severity}`}>{alert.severity}</span></td>
                              <td><span className={`sg-chip sg-stat-${alert.status}`}>{STATUS_LABELS[alert.status] || alert.status}</span></td>
                              <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                                {alert.assigned_to ? alert.assigned_to : "Unassigned"}
                              </td>
                              <td>
                                <div className="det-action-btns">
                                  {alert.status === "NEW" && (<>
                                    <button className="det-btn det-btn--escalate" onClick={() => updateStatus(alert.id, "ESCALATED")}>Escalate</button>
                                    <button className="det-btn det-btn--ghost" title="Mark as false positive"
                                      onClick={() => updateStatus(alert.id, "FALSE_POSITIVE")}>False Positive</button>
                                    </>)}
                                    <button className="det-btn det-btn--ghost" onClick={() => setNoteModal(alert)}>
                                    {alert.notes ? "📝" : "+ Note"}
                                    </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="sg-card">
                <div className="sg-card-header">
                  <h2 className="sg-card-title">Incident Summary — My Zones</h2>
                  <span className="ops-readonly-badge">View &amp; Review Only</span>
                </div>
                <div className="sg-table-wrap">
                  <table className="sg-table">
                    <thead>
                      <tr><th>ID</th><th>TIME</th><th>CAMERA</th><th>SEVERITY</th><th>STATUS</th><th>DESCRIPTION</th></tr>
                    </thead>
                    <tbody>
                      {SAMPLE_INCIDENTS.map(inc => (
                        <tr key={inc.id}>
                          <td className="sg-td-bold">{inc.id}</td>
                          <td className="sg-td-mono">{inc.time}</td>
                          <td>{inc.camera_name}</td>
                          <td><span className={`sg-chip sg-sev-${inc.severity}`}>{inc.severity}</span></td>
                          <td><span className={`sg-chip sg-stat-${inc.status}`}>{INCIDENT_LABELS[inc.status]}</span></td>
                          <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{inc.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="sg-placeholder-note">Closing or mitigating incidents requires Administrator action.</p>
              </section>
            </div>

            <div className="ops-col-side">
              <section className="sg-card">
                <div className="sg-card-header">
                  <h2 className="sg-card-title">Detection Trend</h2>
                  <span className="sg-analytics-sub">Last 24 hours</span>
                </div>
                <Sparkline points={[1,3,2,5,4,7,6,9,5,3,6,8]} color="#2563eb" />
                <div className="sg-chart-xaxis" style={{ marginTop: 4 }}>
                  {["12h","9h","6h","3h","Now"].map(l => <span key={l}>{l}</span>)}
                </div>
                <div className="ops-trend-stats">
                  {[
                    { label: "New",       val: countByStatus.NEW,            color: "#dc2626" },
                    { label: "Escalated", val: countByStatus.ESCALATED,      color: "#ea580c" },
                    { label: "Closed",    val: countByStatus.CLOSED,         color: "#16a34a" },
                  ].map(s => (
                    <div key={s.label} className="ops-trend-stat">
                      <div className="ops-trend-stat-val" style={{ color: s.color }}>{s.val}</div>
                      <div className="ops-trend-stat-label">{s.label}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="sg-card">
                <div className="sg-card-header">
                  <h2 className="sg-card-title">Camera Status</h2>
                  <span className="ops-readonly-badge">View Only</span>
                </div>
                <div className="sg-cam-ratio">{onlineCams}<span className="sg-cam-ratio-total"> / {ASSIGNED_ZONES.length}</span></div>
                <div className="sg-cam-bar-track" style={{ marginBottom: 14 }}>
                  <div className="sg-cam-bar-fill" style={{ width: `${(onlineCams / ASSIGNED_ZONES.length) * 100}%` }} />
                </div>
                {ASSIGNED_ZONES.map(z => (
                  <div key={z.id} className="ops-cam-row">
                    <div className="ops-cam-info">
                      <span className={`ops-zone-dot ops-zone-dot--${z.status.toLowerCase()}`} />
                      <span className="ops-cam-name">{z.name}</span>
                    </div>
                    <span className={`sg-chip ${z.status === "ONLINE" ? "sg-stat-REVIEWED" : "sg-stat-ESCALATED"}`} style={{ fontSize: 9 }}>{z.status}</span>
                  </div>
                ))}
                {offlineCams > 0 && (
                  <p className="sg-placeholder-note" style={{ marginTop: 10 }}>
                    ⚠ {offlineCams} camera{offlineCams > 1 ? "s are" : " is"} offline. Contact the Administrator.
                  </p>
                )}
              </section>

              <section className="sg-card">
                <div className="sg-card-header"><h2 className="sg-card-title">Alerts by Camera</h2></div>
                {ASSIGNED_ZONES.map(z => {
                  const count = alerts.filter(a =>
                    (a.camera?.name || a.camera_name || "").includes(z.name.split("—")[0].trim())
                  ).length;
                  return (
                    <div key={z.id} className="sg-top-cam-bar-row" style={{ marginBottom: 8 }}>
                      <span style={{ width: 155, flexShrink: 0, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{z.name}</span>
                      <div className="sg-top-cam-bar-track" style={{ flex: 1 }}>
                        <div className="sg-top-cam-bar-fill" style={{ width: alerts.length ? `${(count/alerts.length)*100}%` : "0%", background: "var(--accent-blue)" }} />
                      </div>
                      <span className="sg-top-cam-count">{count}</span>
                    </div>
                  );
                })}
              </section>
            </div>
          </div>
        </div>
      </div>

      {noteModal && (
        <NotesModal alert={noteModal} onSave={note => saveNote(noteModal.id, note)} onClose={() => setNoteModal(null)} />
      )}
    </div>
  );
}