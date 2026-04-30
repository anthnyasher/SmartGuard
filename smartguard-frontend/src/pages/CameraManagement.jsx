// src/pages/CameraManagement.jsx
import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getCameras, createCamera, updateCamera, deleteCamera } from "../api/cameraApi.js";
import CameraFormModal from "../components/CameraFormModal.jsx";
import "./AdminDashboard.css";
import "./CameraManagement.css";

const NAV_ITEMS = [
  { id: "dashboard",  label: "Dashboard",          icon: "⊞", path: "/admin",            functional: true  },
  { id: "live",       label: "Live Monitoring",     icon: "◉", path: "/admin/live",       functional: true  },
  { id: "detections", label: "Detections & Alerts", icon: "✦", path: "/admin/detections", functional: false, badge: "6" },
  { id: "evidence",   label: "Evidence Vault",      icon: "🔒", path: "/admin/evidence",   functional: false },
  { id: "cameras",    label: "Cameras",             icon: "📷", path: "/admin/cameras",    functional: true  },
  { id: "logs",       label: "Logs",                icon: "📋", path: "/admin/logs",       functional: false },
  { id: "access",     label: "Access Control",      icon: "🔑", path: "/admin/access",     functional: false },
  { id: "settings",   label: "Settings",            icon: "⚙",  path: "/admin/settings",   functional: false },
];

// ── Delete confirmation modal ──────────────────────────────────────────────────
function DeleteConfirmModal({ camera, onConfirm, onCancel, deleting }) {
  return (
    <div className="cfm-overlay" onClick={onCancel}>
      <div className="lm-confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="lm-confirm-icon">🗑</div>
        <h3 className="lm-confirm-title">Delete Camera?</h3>
        <p className="lm-confirm-desc">
          <strong>{camera.name}</strong> will be permanently removed from SmartGuard.
          Associated alerts and detection records will remain.
        </p>
        <div className="lm-confirm-actions">
          <button className="lm-modal-btn-cancel" onClick={onCancel} disabled={deleting}>Cancel</button>
          <button className="lm-confirm-delete-btn" onClick={onConfirm} disabled={deleting}>
            {deleting ? "Deleting..." : "Yes, Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
function CameraManagement() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [cameras,          setCameras]          = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [search,           setSearch]           = useState("");

  // Modal state
  const [modal,    setModal]    = useState(null);  // null | "add" | "edit" | "delete"
  const [selected, setSelected] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formErr,  setFormErr]  = useState(null);

  const loadCameras = useCallback(async () => {
    if (!token) return;
    try {
      const cams = await getCameras(token);
      setCameras(Array.isArray(cams) ? cams : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadCameras(); }, [loadCameras]);

  const handleLogout     = () => { logout(); navigate("/login", { replace: true }); };
  const handleComingSoon = (label) => alert(`"${label}" is not yet implemented.`);

  // ── CRUD handlers ──────────────────────────────────────────────────────
  const handleAdd = async (data) => {
    setSaving(true); setFormErr(null);
    try {
      await createCamera(token, data);
      await loadCameras();
      setModal(null);
    } catch (err) {
      setFormErr(err?.response?.data?.detail || "Failed to add camera.");
    } finally { setSaving(false); }
  };

  const handleEdit = async (data) => {
    setSaving(true); setFormErr(null);
    try {
      await updateCamera(token, selected.id, data);
      await loadCameras();
      setModal(null);
    } catch (err) {
      setFormErr(err?.response?.data?.detail || "Failed to update camera.");
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteCamera(token, selected.id);
      await loadCameras();
      setModal(null); setSelected(null);
    } catch { setFormErr("Failed to delete camera."); setModal(null); }
    finally { setDeleting(false); }
  };

  const openEdit   = (cam) => { setSelected(cam); setFormErr(null); setModal("edit"); };
  const openDelete = (cam) => { setSelected(cam); setModal("delete"); };
  const closeModal = ()    => { setModal(null); setFormErr(null); };

  // ── Filtered cameras ───────────────────────────────────────────────────
  const filtered = cameras.filter(c =>
    !search ||
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.location?.toLowerCase().includes(search.toLowerCase()) ||
    c.zone?.toLowerCase().includes(search.toLowerCase())
  );

  const onlineCount  = cameras.filter(c => c.status === "ONLINE"  || c.status === "online").length;
  const offlineCount = cameras.filter(c => c.status === "OFFLINE" || c.status === "offline").length;

  return (
    <div className="sg-layout">

      {/* ── Sidebar ── */}
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
          {NAV_ITEMS.map(item =>
            item.functional ? (
              <Link key={item.id} to={item.path} className={`sg-nav-item${item.id === "cameras" ? " sg-nav-active" : ""}`}>
                <span className="sg-nav-icon">{item.icon}</span>
                {!sidebarCollapsed && <span className="sg-nav-label">{item.label}</span>}
                {!sidebarCollapsed && item.badge && <span className="sg-nav-badge">{item.badge}</span>}
              </Link>
            ) : (
              <button key={item.id} className="sg-nav-item sg-nav-future" onClick={() => handleComingSoon(item.label)} title={sidebarCollapsed ? item.label : ""}>
                <span className="sg-nav-icon">{item.icon}</span>
                {!sidebarCollapsed && <span className="sg-nav-label">{item.label}</span>}
                {!sidebarCollapsed && item.badge && <span className="sg-nav-badge sg-nav-badge-dim">{item.badge}</span>}
                {!sidebarCollapsed && <span className="sg-nav-soon"></span>}
              </button>
            )
          )}
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

      {/* ── Main ── */}
      <div className="sg-main">
        <header className="sg-topbar">
          <div className="sg-topbar-left">
            <button className="sg-collapse-btn" onClick={() => setSidebarCollapsed(p => !p)}>☰</button>
            <div className="sg-breadcrumb">
              <span className="sg-breadcrumb-root">Dashboard</span>
              <span className="sg-breadcrumb-sep">›</span>
              <span className="sg-breadcrumb-current">Cameras</span>
            </div>
          </div>
          <div className="sg-topbar-right">
            <Link to="/admin/live" className="cm-live-btn">◉ Live Monitoring</Link>
          </div>
        </header>

        <div className="sg-content">

          {/* Page header */}
          <div className="cm-page-header">
            <div>
              <h1 className="sg-page-title">Camera Management</h1>
              {!loading && (
                <p className="cm-page-subtitle">
                  {cameras.length} camera{cameras.length !== 1 ? "s" : ""} total
                  · <span className="cm-stat-online">{onlineCount} online</span>
                  · <span className="cm-stat-offline">{offlineCount} offline</span>
                </p>
              )}
            </div>
            <button
              className="cm-add-btn"
              onClick={() => { setFormErr(null); setModal("add"); }}
            >
              + Add Camera
            </button>
          </div>

          {/* KPI strip */}
          {!loading && cameras.length > 0 && (
            <div className="cm-kpi-strip">
              <div className="cm-kpi">
                <span className="cm-kpi-val">{cameras.length}</span>
                <span className="cm-kpi-label">Total</span>
              </div>
              <div className="cm-kpi cm-kpi--green">
                <span className="cm-kpi-val">{onlineCount}</span>
                <span className="cm-kpi-label">Online</span>
              </div>
              <div className="cm-kpi cm-kpi--red">
                <span className="cm-kpi-val">{offlineCount}</span>
                <span className="cm-kpi-label">Offline</span>
              </div>
              <div className="cm-kpi cm-kpi--blue">
                <span className="cm-kpi-val">{cameras.filter(c => c.stream_mjpeg_url).length}</span>
                <span className="cm-kpi-label">With Stream</span>
              </div>
              <div className="cm-kpi cm-kpi--amber">
                <span className="cm-kpi-val">{cameras.filter(c => !c.is_active).length}</span>
                <span className="cm-kpi-label">Inactive</span>
              </div>
            </div>
          )}

          {/* Camera table */}
          <section className="sg-card cm-table-card">
            <div className="sg-card-header">
              <h2 className="sg-card-title">All Cameras</h2>
              <div className="cm-table-toolbar">
                <div className="sg-search-wrap" style={{ minWidth: 220 }}>
                  <span className="sg-search-icon">🔍</span>
                  <input
                    className="sg-search-input"
                    placeholder="Search by name, location, zone..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {search && (
                    <button className="cm-search-clear" onClick={() => setSearch("")}>✕</button>
                  )}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="sg-loading"><div className="sg-spinner" /> Loading cameras...</div>
            ) : filtered.length === 0 ? (
              <div className="sg-empty">
                {search ? `No cameras match "${search}".` : "No cameras configured yet."}
                {!search && (
                  <button
                    className="lm-inline-add-btn"
                    style={{ marginLeft: 8 }}
                    onClick={() => setModal("add")}
                  >
                    Add your first camera →
                  </button>
                )}
              </div>
            ) : (
              <div className="sg-table-wrap">
                <table className="sg-table cm-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Camera</th>
                      <th>Location / Zone</th>
                      <th>RTSP URL</th>
                      <th>Stream</th>
                      <th>Status</th>
                      <th>Active</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((cam, i) => {
                      const isOnline = cam.status === "ONLINE" || cam.status === "online";
                      return (
                        <tr key={cam.id}>
                          <td className="cm-td-index">{i + 1}</td>
                          <td>
                            <div className="cm-cam-name-row">
                              <span className={`lm-status-dot ${isOnline ? "dot-online" : "dot-offline"}`} />
                              <span className="cm-cam-name">{cam.name}</span>
                            </div>
                          </td>
                          <td>
                            <div className="cm-location-cell">
                              {cam.location && <span>{cam.location}</span>}
                              {cam.zone     && <span className="cm-zone-tag">{cam.zone}</span>}
                              {!cam.location && !cam.zone && <span className="cm-na">—</span>}
                            </div>
                          </td>
                          <td>
                            <span className="cm-url-cell" title={cam.rtsp_url}>
                              {cam.rtsp_url
                                ? cam.rtsp_url.replace(/\/\/[^@]+@/, "//***@")  // hide credentials
                                : <span className="cm-na">Not set</span>
                              }
                            </span>
                          </td>
                          <td>
                            {cam.stream_mjpeg_url
                              ? <span className="cm-stream-yes">● Live</span>
                              : <span className="cm-na">—</span>
                            }
                          </td>
                          <td>
                            <span className={`lm-status-chip ${isOnline ? "chip-online" : "chip-offline"}`}>
                              {cam.status || "UNKNOWN"}
                            </span>
                          </td>
                          <td>
                            <span className={`cm-active-chip ${cam.is_active ? "cm-active-yes" : "cm-active-no"}`}>
                              {cam.is_active ? "Yes" : "No"}
                            </span>
                          </td>
                          <td>
                            <div className="cm-action-row">
                              <button
                                className="cm-edit-btn"
                                onClick={() => openEdit(cam)}
                                title="Edit camera"
                              >
                                ✎ Edit
                              </button>
                              <button
                                className="cm-delete-btn"
                                onClick={() => openDelete(cam)}
                                title="Delete camera"
                              >
                                🗑
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

          {/* Quick access note */}
          <div className="cm-quick-note">
            💡 You can also add and edit cameras directly from{" "}
            <Link to="/admin/live" className="cm-link">Live Monitoring → Configure Cameras</Link>
          </div>

        </div>
      </div>

      {/* ── Modals ── */}
      {modal === "add" && (
        <CameraFormModal mode="add" onSave={handleAdd} onClose={closeModal} saving={saving} error={formErr} />
      )}
      {modal === "edit" && selected && (
        <CameraFormModal mode="edit" camera={selected} onSave={handleEdit} onClose={closeModal} saving={saving} error={formErr} />
      )}
      {modal === "delete" && selected && (
        <DeleteConfirmModal camera={selected} onConfirm={handleDelete} onCancel={closeModal} deleting={deleting} />
      )}

    </div>
  );
}

export default CameraManagement;
