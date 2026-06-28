import NotificationBell from "../components/NotificationBell.jsx";
// src/pages/IncidentResponse.jsx
// ─────────────────────────────────────────────────────────────────────────────
// FRS Module 7: Incident Response Management
//
// Full CRUD interface for incident reports. Admins and OPS Managers can:
//   - View all incident reports with filtering by status
//   - Create new IR linked to an alert
//   - Update status, action taken, notes
//   - Resolve or escalate incidents
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getIncidents, createIncident, updateIncident } from "../api/incidentApi.js";
import { getAlerts } from "../api/alertApi.js";
import "./AdminDashboard.css";
import "./shared-components.css";
import "./IncidentResponse.css";
import useDocumentTitle from "../utils/useDocumentTitle.js";

const NAV_ITEMS = [
  { id: "dashboard",  label: "Dashboard",          icon: "⊞", path: "/admin"            },
  { id: "live",       label: "Live Monitoring",     icon: "◉", path: "/admin/live"       },
  { id: "detections", label: "Detections & Alerts", icon: "✦", path: "/admin/detections" },
  { id: "evidence",   label: "Evidence Vault",      icon: "🔒", path: "/admin/evidence"   },
  { id: "incidents",  label: "Incident Response",   icon: "📝", path: "/admin/incidents"  },
  { id: "cameras",    label: "Cameras",             icon: "📷", path: "/admin/cameras"    },
  { id: "logs",       label: "Logs",                icon: "📋", path: "/admin/logs"       },
  { id: "access",     label: "Access Control",      icon: "🔑", path: "/admin/access"     },
  { id: "settings",   label: "Settings",            icon: "⚙",  path: "/admin/settings"   },
];

const STATUS_CHOICES = [
  { value: "OPEN",        label: "Open",        cls: "ir-stat-open" },
  { value: "IN_PROGRESS", label: "In Progress", cls: "ir-stat-progress" },
  { value: "RESOLVED",    label: "Resolved",    cls: "ir-stat-resolved" },
  { value: "ESCALATED",   label: "Escalated",   cls: "ir-stat-escalated" },
  { value: "FALSE_ALARM", label: "False Alarm", cls: "ir-stat-false" },
];

const ACTION_CHOICES = [
  { value: "VERBAL_WARNING",   label: "Verbal Warning" },
  { value: "ITEM_RECOVERED",   label: "Item Recovered" },
  { value: "SUSPECT_DETAINED", label: "Suspect Detained" },
  { value: "POLICE_CALLED",    label: "Police Called" },
  { value: "CCTV_REVIEWED",    label: "CCTV Reviewed" },
  { value: "NO_ACTION",        label: "No Action Required" },
  { value: "OTHER",            label: "Other" },
];

function statusCls(s) {
  return STATUS_CHOICES.find(c => c.value === s)?.cls || "";
}
function statusLabel(s) {
  return STATUS_CHOICES.find(c => c.value === s)?.label || s;
}
function actionLabel(a) {
  return ACTION_CHOICES.find(c => c.value === a)?.label || a;
}

export default function IncidentResponse() {
  useDocumentTitle("Incident Response");
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth <= 768);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selected, setSelected]   = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [alertsList, setAlertsList] = useState([]);

  useEffect(() => {
    if (showCreate) {
      getAlerts(token).then(data => setAlertsList(data)).catch(err => console.error("Failed to load alerts", err));
    }
  }, [showCreate, token]);

  // ── Create form state ──────────────────────────────────────────────────────
  const [newIR, setNewIR] = useState({
    alert: "",
    action_taken: "CCTV_REVIEWED",
    status: "OPEN",
    description: "",
    notes: "",
    external_reference: "",
  });

  // ── Edit form state ────────────────────────────────────────────────────────
  const [editFields, setEditFields] = useState({});

  const fetchIncidents = useCallback(async () => {
    try {
      const params = {};
      if (statusFilter !== "ALL") params.status = statusFilter;
      const data = await getIncidents(token, params);
      setIncidents(data);
    } catch (err) {
      console.error("Failed to fetch incidents:", err);
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter]);

  useEffect(() => { if (token) fetchIncidents(); }, [fetchIncidents, token]);

  // When selecting an incident, populate edit fields
  useEffect(() => {
    if (selected) {
      setEditFields({
        status: selected.status,
        action_taken: selected.action_taken,
        notes: selected.notes || "",
        description: selected.description || "",
        external_reference: selected.external_reference || "",
      });
    }
  }, [selected]);

  const handleLogout = () => { logout(); navigate("/login", { replace: true }); };

  // ── Create ─────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!newIR.alert) { alert("Please select an Alert ID."); return; }
    if (!newIR.description || !newIR.description.trim()) { alert("Please provide a description of the incident."); return; }
    if (!newIR.action_taken) { alert("Please select an action taken."); return; }
    setSaving(true);
    try {
      const result = await createIncident(token, {
        ...newIR,
        alert: parseInt(newIR.alert, 10),
      });
      alert(`Incident Report IR-${String(result.id).padStart(4, "0")} created successfully.`);
      setShowCreate(false);
      setNewIR({ alert: "", action_taken: "CCTV_REVIEWED", status: "OPEN", description: "", notes: "", external_reference: "" });
      await fetchIncidents();
    } catch (err) {
      alert("Failed to create incident report. Make sure the Alert ID is valid.");
    } finally {
      setSaving(false);
    }
  };

  // ── Update ─────────────────────────────────────────────────────────────────
  const handleUpdate = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const result = await updateIncident(token, selected.id, editFields);
      alert(`IR-${String(result.id).padStart(4, "0")} updated successfully.`);
      setSelected(null);
      await fetchIncidents();
    } catch (err) {
      alert("Failed to update incident report.");
    } finally {
      setSaving(false);
    }
  };

  // ── Quick status update ────────────────────────────────────────────────────
  const handleQuickStatus = async (ir, newStatus) => {
    try {
      await updateIncident(token, ir.id, { status: newStatus });
      await fetchIncidents();
      if (selected?.id === ir.id) {
        setSelected(prev => ({ ...prev, status: newStatus }));
        setEditFields(prev => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      alert("Failed to update status.");
    }
  };

  const stats = {
    total: incidents.length,
    open: incidents.filter(i => i.status === "OPEN").length,
    inProgress: incidents.filter(i => i.status === "IN_PROGRESS").length,
    resolved: incidents.filter(i => i.status === "RESOLVED").length,
    escalated: incidents.filter(i => i.status === "ESCALATED").length,
  };

  return (
    <div className="sg-layout">
      <aside className={`sg-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sg-sidebar-logo">
          <img src="/favicon.png" alt="Logo" className="sg-logo-icon" style={{ width: "24px", height: "24px", objectFit: "contain" }} />
          {!sidebarCollapsed && <span className="sg-logo-text"><span className="sg-logo-smart">SMART</span><span className="sg-logo-guard">GUARD</span></span>}
        </div>
        <nav className="sg-sidebar-nav">
          {NAV_ITEMS.map(item => (
            <Link key={item.id} to={item.path} className={`sg-nav-item${item.id === "incidents" ? " sg-nav-active" : ""}`}>
              <span className="sg-nav-icon">{item.icon}</span>
              {!sidebarCollapsed && <span className="sg-nav-label">{item.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="sg-sidebar-footer">
          <div className="sg-user-row">
            <div className="sg-user-avatar">{user?.email?.[0]?.toUpperCase() || "A"}</div>
            {!sidebarCollapsed && <div className="sg-user-info"><div className="sg-user-name">{user?.email}</div><div className="sg-user-role">{user?.role}</div></div>}
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
              <span className="sg-breadcrumb-current">Incident Response</span>
            </div>
          </div>
          <div className="sg-topbar-right">
              <NotificationBell />
            </div>
          </header>

        <div className="sg-content">
          <div className="ir-page-header">
            <div>
              <h1 className="sg-page-title">Incident Response</h1>
              <p className="ir-subtitle">Manage response actions for detected incidents</p>
            </div>
            <button className="ir-create-btn" onClick={() => setShowCreate(true)}>+ New Report</button>
          </div>

          {/* KPI Strip */}
          <div className="sg-kpi-strip" style={{ gridTemplateColumns: "repeat(5,1fr)", marginBottom: 20 }}>
            {[
              { label: "Total Reports", val: stats.total,      icon: "📝", cls: "kpi-blue",   iconCls: "kpi-icon-blue" },
              { label: "Open",          val: stats.open,       icon: "🔴", cls: "kpi-amber",  iconCls: "kpi-icon-amber" },
              { label: "In Progress",   val: stats.inProgress, icon: "🔄", cls: "kpi-purple", iconCls: "kpi-icon-purple" },
              { label: "Resolved",      val: stats.resolved,   icon: "✓",  cls: "kpi-green",  iconCls: "kpi-icon-green" },
              { label: "Escalated",     val: stats.escalated,  icon: "⚠",  cls: "kpi-red",    iconCls: "kpi-icon-red" },
            ].map(k => (
              <div key={k.label} className={`sg-kpi ${k.cls}`}>
                <div className={`sg-kpi-icon-wrap ${k.iconCls}`}>{k.icon}</div>
                <div><div className="sg-kpi-val">{k.val}</div><div className="sg-kpi-label">{k.label}</div></div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="sg-card">
            <div className="det-filters-bar">
              <div className="det-filter-group">
                <label className="det-filter-label">Status</label>
                <div className="det-filter-tabs">
                  {["ALL", ...STATUS_CHOICES.map(s => s.value)].map(s => (
                    <button key={s} className={`det-filter-tab${statusFilter === s ? " det-filter-tab--active" : ""}`} onClick={() => setStatusFilter(s)}>
                      {s === "ALL" ? "ALL" : statusLabel(s)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="sg-table-wrap">
              <table className="sg-table">
                <thead>
                  <tr>
                    <th>IR ID</th><th>ALERT</th><th>CAMERA</th>
                    <th>BEHAVIOR</th><th>STATUS</th><th>ACTION TAKEN</th>
                    <th>RESPONDER</th><th>CREATED</th><th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} style={{ textAlign: "center", padding: 40 }}>Loading...</td></tr>
                  ) : incidents.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No incident reports found.</td></tr>
                  ) : (
                    incidents.map(ir => (
                      <tr key={ir.id} className={selected?.id === ir.id ? "det-row--selected" : ""} onClick={() => setSelected(ir)} style={{ cursor: "pointer" }}>
                        <td><span className="ir-id">IR-{String(ir.id).padStart(4, "0")}</span></td>
                        <td><span className="ir-alert-link">#{ir.alert_id}</span></td>
                        <td>{ir.camera_name || "—"}</td>
                        <td className="sg-td-bold">{(ir.behavior_type || "").replace("_", " ")}</td>
                        <td><span className={`sg-chip ${statusCls(ir.status)}`}>{statusLabel(ir.status)}</span></td>
                        <td>{actionLabel(ir.action_taken)}</td>
                        <td>{ir.responder_name || "—"}</td>
                        <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{ir.created_at ? new Date(ir.created_at).toLocaleString() : "—"}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="det-action-btns">
                            <button className="det-btn det-btn--view" onClick={() => setSelected(ir)}>View</button>
                            {ir.status === "OPEN" && (
                              <button className="det-btn det-btn--confirm" onClick={() => handleQuickStatus(ir, "IN_PROGRESS")} title="Start working">▶</button>
                            )}
                            {ir.status === "IN_PROGRESS" && (
                              <button className="det-btn det-btn--confirm" onClick={() => handleQuickStatus(ir, "RESOLVED")} title="Mark resolved">✓</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="det-table-footer">
              <span className="det-count-label">Showing {incidents.length} incident report{incidents.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Detail / Edit Panel ───────────────────────────────────────────────── */}
      {selected && (
        <div className="det-detail-panel">
          <div className="det-detail-header">
            <span className="det-detail-title">IR-{String(selected.id).padStart(4, "0")}</span>
            <button className="lm-modal-close" onClick={() => setSelected(null)}>✕</button>
          </div>
          <div className="det-detail-body">
            {/* Info rows */}
            <div className="det-detail-rows">
              {[
                ["Alert ID",     `#${selected.alert_id}`],
                ["Camera",       selected.camera_name || "—"],
                ["Behavior",     selected.behavior_type || "—"],
                ["Severity",     selected.severity || "—"],
                ["Responder",    selected.responder_name || "Unassigned"],
                ["Created",      selected.created_at ? new Date(selected.created_at).toLocaleString() : "—"],
                ["Resolved At",  selected.resolved_at ? new Date(selected.resolved_at).toLocaleString() : "—"],
                ["External Ref", selected.external_reference || "—"],
              ].map(([k, v]) => (
                <div key={k} className="det-detail-row">
                  <span className="det-detail-key">{k}</span>
                  <span className="det-detail-val">{v}</span>
                </div>
              ))}
            </div>

            {/* Editable fields */}
            <div className="ir-edit-section">
              <div className="ir-field">
                <label className="ir-field-label">Status *</label>
                <select className="ir-select" value={editFields.status || ""} onChange={e => setEditFields(p => ({ ...p, status: e.target.value }))}>
                  {STATUS_CHOICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="ir-field">
                <label className="ir-field-label">Action Taken *</label>
                <select className="ir-select" value={editFields.action_taken || ""} onChange={e => setEditFields(p => ({ ...p, action_taken: e.target.value }))}>
                  {ACTION_CHOICES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              <div className="ir-field">
                <label className="ir-field-label">Description *</label>
                <textarea className="ir-textarea" rows={3} value={editFields.description || ""} onChange={e => setEditFields(p => ({ ...p, description: e.target.value }))} placeholder="Describe the incident and response..." />
              </div>
              <div className="ir-field">
                <label className="ir-field-label">Notes (optional)</label>
                <textarea className="ir-textarea" rows={2} value={editFields.notes || ""} onChange={e => setEditFields(p => ({ ...p, notes: e.target.value }))} placeholder="Additional notes or follow-up..." />
              </div>
              <div className="ir-field">
                <label className="ir-field-label">External Reference (optional)</label>
                <input className="ir-input" value={editFields.external_reference || ""} onChange={e => setEditFields(p => ({ ...p, external_reference: e.target.value }))} placeholder="Police blotter #, barangay report #..." />
              </div>
            </div>

            <div className="det-detail-actions">
              <button className="det-btn-full det-btn-full--primary" onClick={handleUpdate} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button className="det-btn-full det-btn-full--ghost" onClick={() => navigate("/admin/detections")}>
                View Original Alert →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Modal ──────────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="ir-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="ir-modal" onClick={e => e.stopPropagation()}>
            <div className="ir-modal-header">
              <h2 className="ir-modal-title">New Incident Report</h2>
              <button className="lm-modal-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="ir-modal-body">
              <div className="ir-field">
                <label className="ir-field-label">Alert ID *</label>
                <select className="ir-select" value={newIR.alert} onChange={e => setNewIR(p => ({ ...p, alert: e.target.value }))}>
                  <option value="">Select an Alert...</option>
                  {alertsList.map(a => (
                    <option key={a.id} value={a.id}>
                      Alert #{a.id} - {a.camera_name || `Camera ${a.camera}`} ({new Date(a.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })} | {a.camera_location || "No Loc"} - {a.camera_zone || "No Zone"})
                    </option>
                  ))}
                </select>
              </div>
              <div className="ir-field">
                <label className="ir-field-label">Status *</label>
                <select className="ir-select" value={newIR.status} onChange={e => setNewIR(p => ({ ...p, status: e.target.value }))}>
                  {STATUS_CHOICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="ir-field">
                <label className="ir-field-label">Action Taken *</label>
                <select className="ir-select" value={newIR.action_taken} onChange={e => setNewIR(p => ({ ...p, action_taken: e.target.value }))}>
                  {ACTION_CHOICES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              <div className="ir-field">
                <label className="ir-field-label">Description *</label>
                <textarea className="ir-textarea" rows={3} value={newIR.description} onChange={e => setNewIR(p => ({ ...p, description: e.target.value }))} placeholder="Describe the incident..." />
              </div>
              <div className="ir-field">
                <label className="ir-field-label">Notes (optional)</label>
                <textarea className="ir-textarea" rows={2} value={newIR.notes} onChange={e => setNewIR(p => ({ ...p, notes: e.target.value }))} placeholder="Additional notes..." />
              </div>
              <div className="ir-field">
                <label className="ir-field-label">External Reference (optional)</label>
                <input className="ir-input" value={newIR.external_reference} onChange={e => setNewIR(p => ({ ...p, external_reference: e.target.value }))} placeholder="Police blotter #, barangay report #..." />
              </div>
            </div>
            <div className="ir-modal-footer">
              <button className="det-btn-full det-btn-full--ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="det-btn-full det-btn-full--primary" onClick={handleCreate} disabled={saving}>
                {saving ? "Creating..." : "Create Report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
