// src/pages/DetectionsPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin Detections & Alerts — matches OpsAlertPage layout with
//   ✓ Check = Escalate (confirm positive)
//   ✕ X     = Mark FALSE_POSITIVE → then DELETE alert + evidence clip
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import "./AdminDashboard.css";
import "./shared-components.css";
import "./OpsDashboard.css";
import "./DetectionsPage.css";
import useDocumentTitle from "../utils/useDocumentTitle.js";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// ── Nav ────────────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "dashboard",  label: "Dashboard",          icon: "⊞", path: "/admin" },
  { id: "live",       label: "Live Monitoring",     icon: "◉", path: "/admin/live" },
  { id: "detections", label: "Detections & Alerts", icon: "✦", path: "/admin/detections" },
  { id: "evidence",   label: "Evidence Vault",      icon: "🔒", path: "/admin/evidence" },
  { id: "incidents",  label: "Incident Response",   icon: "📝", path: "/admin/incidents" },
  { id: "cameras",    label: "Cameras",             icon: "📷", path: "/admin/cameras" },
  { id: "logs",       label: "Logs",                icon: "📋", path: "/admin/logs" },
  { id: "access",     label: "Access Control",      icon: "🔑", path: "/admin/access" },
  { id: "settings",   label: "Settings",            icon: "⚙",  path: "/admin/settings" },
];

const STATUS_LABELS = {
  NEW:            "New",
  ESCALATED:      "Escalated",
  FALSE_POSITIVE: "False Positive",
  CLOSED:         "Closed",
};

const BEHAVIOR_DISPLAY = {
  CONCEALMENT: "Concealment",
  LOITERING:   "Loitering",
  RAPID_EXIT:  "Rapid Exit",
  SHOPLIFTING: "Shoplifting",
};

const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// ── Notes Modal ───────────────────────────────────────────────────────────────
function NotesModal({ alert, onSave, onClose }) {
  const [note, setNote] = useState(alert.notes || "");

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const camName = alert.camera_name || `Camera ${alert.camera}`;
  const time    = new Date(alert.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="ops-modal-overlay" onClick={onClose}>
      <div className="ops-modal" onClick={e => e.stopPropagation()}>
        <div className="ops-modal-header">
          <h3 className="ops-modal-title">Add / Edit Note — Alert #{alert.id}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-muted)" }}>✕</button>
        </div>
        <div className="ops-modal-body">
          <div style={{ marginBottom: 12 }}>
            <span className={`sg-chip sg-sev-${alert.severity}`}>{alert.severity}</span>
            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)" }}>
              {camName} · {time}
            </span>
          </div>
          <textarea className="ops-note-input" rows={5}
            placeholder="Add your observation or follow-up notes here…"
            value={note}
            onChange={e => setNote(e.target.value)}
            autoFocus
          />
        </div>
        <div className="ops-modal-footer">
          <button className="det-btn-full det-btn-full--primary" onClick={() => onSave(note)}>Save Note</button>
          <button className="det-btn-full det-btn-full--ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Alert Detail Panel ─────────────────────────────────────────────────────────
function AlertDetailPanel({ alert, onClose, onUpdate, onDeleteAlert }) {
  const { token } = useAuth();
  const [saving, setSaving] = useState(false);

  const classify = async (newStatus) => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/api/alerts/${alert.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdate(updated);
      }
    } catch (e) {
      console.error(e);
    }
    finally { setSaving(false); }
  };

  const camName = alert.camera_name || `Camera ${alert.camera}`;
  const conf    = alert.confidence != null ? Math.round(alert.confidence * 100) : null;

  return (
    <div className="det-detail-panel">
      <div className="det-detail-header">
        <span className="det-detail-title">Alert Detail</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-muted)" }}>✕</button>
      </div>
      <div className="det-detail-body">
        {/* Severity badge */}
        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          <span className={`sg-chip sg-sev-${alert.severity}`}>{alert.severity}</span>
          <span className={`sg-chip sg-stat-${alert.status}`}>{STATUS_LABELS[alert.status]}</span>
        </div>

        {/* Info rows */}
        <div className="det-detail-rows">
          {[
            ["Alert ID",   `#${alert.id}`],
            ["Camera",     camName],
            ["Behavior",   BEHAVIOR_DISPLAY[alert.behavior_type] || alert.behavior_type],
            ["Confidence", conf !== null ? `${conf}%` : "—"],
            ["Time",       new Date(alert.created_at).toLocaleString()],
            ["Location",   alert.camera_location || "—"],
            ["Zone",       alert.camera_zone || "—"],
          ].map(([k, v]) => (
            <div key={k} className="det-detail-row">
              <span className="det-detail-key">{k}</span>
              <span className="det-detail-val">{v}</span>
            </div>
          ))}
        </div>

        {/* Notes */}
        {alert.notes && (
          <div style={{ padding: "10px 12px", background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Note</div>
            {alert.notes}
          </div>
        )}

        {/* Classification actions — only for NEW alerts */}
        {alert.status === "NEW" && (
          <div className="det-detail-actions">
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>CLASSIFY THIS ALERT</div>
            <button className="det-btn-full det-btn-full--primary"
              style={{ background: "linear-gradient(135deg,#16a34a,#15803d)" }}
              disabled={saving}
              onClick={() => classify("ESCALATED")}>
              ✓ Confirm — Escalate Incident
            </button>
            <button className="det-btn-full det-btn-full--ghost"
              style={{ color: "#dc2626" }}
              disabled={saving}
              onClick={() => onDeleteAlert(alert)}>
              ✕ False Positive — Delete Alert & Clip
            </button>
          </div>
        )}

        {/* Already classified notice */}
        {alert.status !== "NEW" && (
          <div style={{ padding: "10px 12px", background: alert.status === "ESCALATED" ? "rgba(22,163,74,0.06)" : "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text-secondary)", textAlign: "center" }}>
            {alert.status === "ESCALATED" && "✓ This alert has been confirmed and escalated."}
            {alert.status === "FALSE_POSITIVE" && "✕ Marked as false positive."}
            {alert.status === "CLOSED" && "✓ This alert has been closed."}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main DetectionsPage
// ══════════════════════════════════════════════════════════════════════════════
function DetectionsPage() {
  useDocumentTitle("Detections & Alerts");
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [alerts,   setAlerts]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sevFilter,    setSevFilter]    = useState("ALL");
  const [search,       setSearch]       = useState("");
  const [selectedAlert,setSelectedAlert]= useState(null);
  const [noteModal,    setNoteModal]    = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth <= 768);

  const handleLogout = () => { logout(); navigate("/login", { replace: true }); };

  const loadAlerts = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true); setError(null);
      const res = await fetch(`${BASE_URL}/api/alerts/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.results ?? []);
      list.sort((a, b) => {
        if (a.status === "NEW" && b.status !== "NEW") return -1;
        if (b.status === "NEW" && a.status !== "NEW") return  1;
        return (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9);
      });
      setAlerts(list);
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  // Auto-refresh every 20s
  useEffect(() => {
    const t = setInterval(() => loadAlerts(), 20_000);
    return () => clearInterval(t);
  }, [loadAlerts]);

  const handleUpdate = (updated) => {
    setAlerts(prev => prev.map(a => a.id === updated.id ? updated : a));
    if (selectedAlert?.id === updated.id) setSelectedAlert(updated);
  };

  // ✓ Check = Escalate (confirm positive alert)
  const handleEscalate = async (alertId) => {
    try {
      const res = await fetch(`${BASE_URL}/api/alerts/${alertId}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "ESCALATED" }),
      });
      if (res.ok) {
        const updated = await res.json();
        handleUpdate(updated);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ✕ X = False Positive → DELETE the alert (backend cascades to evidence clips + files)
  const handleFalsePositiveDelete = async (alertObj) => {
    const alertId = alertObj.id ?? alertObj;
    if (!window.confirm("Mark as false positive and permanently delete this alert and its evidence clip?")) return;
    try {
      const res = await fetch(`${BASE_URL}/api/alerts/${alertId}/`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 204 || res.ok) {
        setAlerts(prev => prev.filter(a => a.id !== alertId));
        if (selectedAlert?.id === alertId) setSelectedAlert(null);
      } else {
        window.alert("Failed to delete alert.");
      }
    } catch (e) {
      console.error(e);
      window.alert("Network error deleting alert.");
    }
  };

  const handleSaveNote = async (note) => {
    const alertData = noteModal;
    try {
      const res = await fetch(`${BASE_URL}/api/alerts/${alertData.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes: note }),
      });
      if (res.ok) {
        const updated = await res.json();
        handleUpdate(updated);
      }
    } catch (e) {
      console.error(e);
    }
    setNoteModal(null);
  };

  // Counts
  const newCount  = alerts.filter(a => a.status === "NEW").length;
  const critCount = alerts.filter(a => a.severity === "CRITICAL").length;
  const highCount = alerts.filter(a => a.severity === "HIGH").length;

  // Filtered
  const filtered = alerts.filter(a => {
    if (statusFilter !== "ALL" && a.status !== statusFilter) return false;
    if (sevFilter    !== "ALL" && a.severity !== sevFilter)    return false;
    if (search) {
      const q = search.toLowerCase();
      const cam = (a.camera_name || `Camera ${a.camera}`).toLowerCase();
      if (!cam.includes(q) && !(a.behavior_type || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="sg-layout">
      {/* Sidebar */}
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

      {/* Main */}
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
          <div className="sg-topbar-right" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {newCount > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 999,
                background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.25)",
                fontSize: 12, fontWeight: 700, color: "var(--accent-red)",
              }}>
                ● {newCount} new alert{newCount !== 1 ? "s" : ""}
              </div>
            )}
            <button onClick={loadAlerts} style={{
              padding: "6px 12px", fontSize: 11, fontWeight: 600,
              fontFamily: "'DM Sans',sans-serif",
              border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
              background: "var(--bg-surface)", color: "var(--text-muted)", cursor: "pointer",
            }}>
              ↻ Refresh
            </button>
          </div>
        </header>

        <div className="sg-content">
          <div className="dp-page-header">
            <div>
              <h1 className="sg-page-title">Detections & Alerts</h1>
              <p className="dp-subtitle">Real-time AI behavior detection feed</p>
            </div>
          </div>

          {/* KPI strip */}
          <div className="ops-kpi-strip">
            {[
              { key: "ALL",            label: "All Alerts",    val: alerts.length,  icon: "✦", cls: "ops-kpi--blue"  },
              { key: "NEW",            label: "New",           val: newCount,       icon: "⚑", cls: "ops-kpi--red"   },
              { key: "ESCALATED",      label: "Escalated",     val: alerts.filter(a => a.status === "ESCALATED").length,      icon: "↑", cls: "ops-kpi--amber" },
              { key: "FALSE_POSITIVE", label: "False Positive",val: alerts.filter(a => a.status === "FALSE_POSITIVE").length, icon: "✕", cls: "ops-kpi--gray"  },
              { key: "CLOSED",         label: "Closed",        val: alerts.filter(a => a.status === "CLOSED").length,         icon: "✓", cls: "ops-kpi--green" },
            ].map(k => (
              <button key={k.key}
                className={`ops-kpi ${k.cls}${statusFilter === k.key ? " ops-kpi--active" : ""}`}
                onClick={() => setStatusFilter(k.key)}>
                <span className="ops-kpi-icon">{k.icon}</span>
                <div><div className="ops-kpi-val">{k.val}</div><div className="ops-kpi-label">{k.label}</div></div>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            {/* Table */}
            <div className="sg-card" style={{ flex: 1, minWidth: 0 }}>

              {/* Filters */}
              <div className="det-filters-bar">
                <div className="det-search-wrap" style={{ flex: 1 }}>
                  <span className="det-search-icon">🔍</span>
                  <input className="det-search" placeholder="Search by camera or behavior..."
                    value={search} onChange={e => setSearch(e.target.value)} />
                  {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>✕</button>}
                </div>
                <div className="det-filter-group">
                  <label className="det-filter-label">Severity</label>
                  <div className="det-filter-tabs">
                    {["ALL","CRITICAL","HIGH","MEDIUM","LOW"].map(s => (
                      <button key={s}
                        className={`det-filter-tab${sevFilter === s ? " det-filter-tab--active" : ""}`}
                        onClick={() => setSevFilter(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="sg-loading"><div className="sg-spinner" /> Loading alerts…</div>
              ) : error ? (
                <div className="sg-empty" style={{ color: "var(--accent-red)" }}>⚠ {error}</div>
              ) : filtered.length === 0 ? (
                <div className="sg-empty" style={{ padding: "48px 24px" }}>
                  <span style={{ fontSize: 40, display: "block", marginBottom: 10 }}>✦</span>
                  {statusFilter === "ALL" ? "No alerts detected." : `No ${statusFilter.toLowerCase().replace("_", " ")} alerts.`}
                </div>
              ) : (
                <div className="sg-table-wrap">
                  <table className="sg-table">
                    <thead>
                      <tr><th>TIME</th><th>CAMERA</th><th>BEHAVIOR</th><th>CONFIDENCE</th><th>SEVERITY</th><th>STATUS</th><th>NOTES</th><th>ACTIONS</th></tr>
                    </thead>
                    <tbody>
                      {filtered.map(a => {
                        const cam  = a.camera_name || `Camera ${a.camera}`;
                        const time = new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                        const conf = a.confidence != null ? Math.round(a.confidence * 100) : null;
                        const isNew = a.status === "NEW";

                        return (
                          <tr key={a.id}
                            style={{ cursor: "pointer", background: selectedAlert?.id === a.id ? "var(--accent-blue-muted)" : undefined }}
                            onClick={() => setSelectedAlert(a)}>
                            <td className="sg-td-mono">{time}</td>
                            <td>
                              <div className="det-cam-cell">
                                <span className="det-cam-id">#{a.id}</span>
                                <span className="det-cam-name">{cam}</span>
                              </div>
                            </td>
                            <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                              {BEHAVIOR_DISPLAY[a.behavior_type] || a.behavior_type}
                            </td>
                            <td>
                              {conf !== null ? (
                                <div className="det-conf-wrap">
                                  <div className="det-conf-bar-track">
                                    <div className="det-conf-bar-fill" style={{
                                      width: `${conf}%`,
                                      background: conf >= 85 ? "#dc2626" : conf >= 65 ? "#ea580c" : "#2563eb",
                                    }} />
                                  </div>
                                  <span className="det-conf-val">{conf}%</span>
                                </div>
                              ) : "—"}
                            </td>
                            <td><span className={`sg-chip sg-sev-${a.severity}`}>{a.severity}</span></td>
                            <td><span className={`sg-chip sg-stat-${a.status}`}>{STATUS_LABELS[a.status]}</span></td>
                            <td>
                              {a.notes ? (
                                <span style={{ fontSize: 11, color: "var(--accent-blue)", cursor: "pointer" }}
                                  onClick={e => { e.stopPropagation(); setNoteModal(a); }}>
                                  📝 View
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>
                              )}
                            </td>
                            <td onClick={e => e.stopPropagation()}>
                              <div className="det-action-btns">
                                <button className="det-btn det-btn--view"
                                  onClick={() => setSelectedAlert(a)}>Detail</button>
                                {isNew && (
                                  <>
                                    <button className="det-btn det-btn--escalate"
                                      title="Confirm — Escalate"
                                      onClick={() => handleEscalate(a.id)}>
                                      ✓ Confirm
                                    </button>
                                    <button className="det-btn det-btn--delete"
                                      title="False Positive — Delete alert & clip"
                                      onClick={() => handleFalsePositiveDelete(a)}>
                                      ✕ FP
                                    </button>
                                  </>
                                )}
                                <button className="det-btn det-btn--ghost"
                                  onClick={() => setNoteModal(a)}>
                                  {a.notes ? "✎ Note" : "+ Note"}
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

              <div className="det-table-footer">
                <span className="det-count-label">
                  Showing {filtered.length} of {alerts.length} alerts
                  {critCount + highCount > 0 && (
                    <span style={{ marginLeft: 10, color: "var(--accent-red)", fontWeight: 600 }}>
                      · {critCount + highCount} high-priority
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Detail panel */}
            {selectedAlert && (
              <AlertDetailPanel
                alert={selectedAlert}
                onClose={() => setSelectedAlert(null)}
                onUpdate={handleUpdate}
                onDeleteAlert={handleFalsePositiveDelete}
              />
            )}
          </div>

          {/* Notes modal */}
          {noteModal && (
            <NotesModal alert={noteModal} onSave={handleSaveNote} onClose={() => setNoteModal(null)} />
          )}
        </div>
      </div>
    </div>
  );
}

export default DetectionsPage;
