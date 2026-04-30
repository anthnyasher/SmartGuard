// src/pages/OpsAlertsPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
// FRS 3.B: Ops Manager receives alerts for assigned cameras/zones.
// FRS 3.C: Can classify New alerts as Escalated or False Positive.
//          Can add notes per alert.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import OpsLayout from "./OpsLayout.jsx";
import "./AdminDashboard.css";
import "./shared-components.css";
import "./OpsDashboard.css";

const BASE_URL = "http://localhost:8000";

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
function AlertDetailPanel({ alert, onClose, onUpdate }) {
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
    } catch (e) { console.error(e); }
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
              style={{ background: "linear-gradient(135deg,#ea580c,#dc2626)" }}
              disabled={saving}
              onClick={() => classify("ESCALATED")}>
              ↑ Escalate — Confirmed Incident
            </button>
            <button className="det-btn-full det-btn-full--ghost"
              disabled={saving}
              onClick={() => classify("FALSE_POSITIVE")}>
              ✕ Mark as False Positive
            </button>
          </div>
        )}

        {/* Already classified notice */}
        {alert.status !== "NEW" && (
          <div style={{ padding: "10px 12px", background: alert.status === "ESCALATED" ? "rgba(220,38,38,0.06)" : "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text-secondary)", textAlign: "center" }}>
            {alert.status === "ESCALATED" && "⬆ This alert has been escalated to Admin."}
            {alert.status === "FALSE_POSITIVE" && "✕ Marked as false positive."}
            {alert.status === "CLOSED" && "✓ This alert has been closed."}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main OpsAlertsPage
// ══════════════════════════════════════════════════════════════════════════════
export default function OpsAlertsPage() {
  const { token } = useAuth();

  const [alerts,   setAlerts]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sevFilter,    setSevFilter]    = useState("ALL");
  const [search,       setSearch]       = useState("");
  const [selectedAlert,setSelectedAlert]= useState(null);
  const [noteModal,    setNoteModal]    = useState(null);
  const [collapsed,    setCollapsed]    = useState(false);

  const loadAlerts = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true); setError(null);
      const res = await fetch(`${BASE_URL}/api/alerts/?alert_category=SHOPLIFTING`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.results ?? []);
      // Sort: NEW first, then by severity, then by time
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

  const handleClassify = async (alertId, newStatus) => {
    try {
      const res = await fetch(`${BASE_URL}/api/alerts/${alertId}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        handleUpdate(updated);
      }
    } catch (e) { console.error(e); }
  };

  const handleSaveNote = async (note) => {
    const alert = noteModal;
    try {
      const res = await fetch(`${BASE_URL}/api/alerts/${alert.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes: note }),
      });
      if (res.ok) {
        const updated = await res.json();
        handleUpdate(updated);
      }
    } catch (e) { console.error(e); }
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

  const topbarRight = (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {newCount > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 12px", borderRadius: 999,
          background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.25)",
          fontSize: 12, fontWeight: 700, color: "var(--accent-red)",
          animation: "sg-spin 0 none", // no spin, just color
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
  );

  return (
    <OpsLayout active="alerts" title="My Alerts"
      subtitle="Alerts for cameras and zones assigned to your account"
      topbarRight={topbarRight}
      sidebarCollapsed={collapsed}
      onToggleSidebar={() => setCollapsed(p => !p)}
    >
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
              {statusFilter === "ALL" ? "No alerts for your assigned cameras." : `No ${statusFilter.toLowerCase().replace("_", " ")} alerts.`}
            </div>
          ) : (
            <div className="sg-table-wrap">
              <table className="sg-table">
                <thead>
                  <tr><th>TIME</th><th>CAMERA</th><th>BEHAVIOR</th><th>CONFIDENCE</th><th>SEVERITY</th><th>STATUS</th><th>NOTES</th><th>ACTIONS</th></tr>
                </thead>
                <tbody>
                  {filtered.map(alert => {
                    const cam  = alert.camera_name || `Camera ${alert.camera}`;
                    const time = new Date(alert.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    const conf = alert.confidence != null ? Math.round(alert.confidence * 100) : null;
                    const isNew = alert.status === "NEW";

                    return (
                      <tr key={alert.id}
                        style={{ cursor: "pointer", background: selectedAlert?.id === alert.id ? "var(--accent-blue-muted)" : undefined }}
                        onClick={() => setSelectedAlert(alert)}>
                        <td className="sg-td-mono">{time}</td>
                        <td>
                          <div className="det-cam-cell">
                            <span className="det-cam-id">#{alert.id}</span>
                            <span className="det-cam-name">{cam}</span>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                          {BEHAVIOR_DISPLAY[alert.behavior_type] || alert.behavior_type}
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
                        <td><span className={`sg-chip sg-sev-${alert.severity}`}>{alert.severity}</span></td>
                        <td><span className={`sg-chip sg-stat-${alert.status}`}>{STATUS_LABELS[alert.status]}</span></td>
                        <td>
                          {alert.notes ? (
                            <span style={{ fontSize: 11, color: "var(--accent-blue)", cursor: "pointer" }}
                              onClick={e => { e.stopPropagation(); setNoteModal(alert); }}>
                              📝 View
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>
                          )}
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="det-action-btns">
                            <button className="det-btn det-btn--view"
                              onClick={() => setSelectedAlert(alert)}>Detail</button>
                            {isNew && (
                              <>
                                <button className="det-btn det-btn--escalate"
                                  onClick={() => handleClassify(alert.id, "ESCALATED")}>
                                  ↑ Escalate
                                </button>
                                <button className="det-btn det-btn--ghost"
                                  onClick={() => handleClassify(alert.id, "FALSE_POSITIVE")}>
                                  ✕ FP
                                </button>
                              </>
                            )}
                            <button className="det-btn det-btn--ghost"
                              onClick={() => setNoteModal(alert)}>
                              {alert.notes ? "✎ Note" : "+ Note"}
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
          />
        )}
      </div>

      {/* Notes modal */}
      {noteModal && (
        <NotesModal alert={noteModal} onSave={handleSaveNote} onClose={() => setNoteModal(null)} />
      )}
    </OpsLayout>
  );
}