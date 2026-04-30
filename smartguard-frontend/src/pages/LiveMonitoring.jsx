// src/pages/LiveMonitoring.jsx
import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getCameras, createCamera, updateCamera, deleteCamera } from "../api/cameraApi.js";
import CameraFormModal from "../components/CameraFormModal.jsx";
import CameraTile from "./CameraTile.jsx";           // ← correct
import AuthenticatedStream from "../components/AuthenticatedStream.jsx";
import "./AdminDashboard.css";
import "./LiveMonitoring.css";
import { useAllDetections } from "../hooks/useAllDetections.js";
import AlertToast from "../components/AlertToast.jsx";


// ── Updated 8-tab nav ──────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "⊞", path: "/admin", functional: true },
  { id: "live", label: "Live Monitoring", icon: "◉", path: "/admin/live", functional: true },
  { id: "detections", label: "Detections & Alerts", icon: "✦", path: "/admin/detections", functional: true, badge: "6" },
  { id: "evidence", label: "Evidence Vault", icon: "🔒", path: "/admin/evidence", functional: true },
  { id: "cameras", label: "Cameras", icon: "📷", path: "/admin/cameras", functional: true },
  { id: "logs", label: "Logs", icon: "📋", path: "/admin/logs", functional: true },
  { id: "access", label: "Access Control", icon: "🔑", path: "/admin/access", functional: true },
  { id: "settings", label: "Settings", icon: "⚙", path: "/admin/settings", functional: true },
];

const GRID_OPTIONS = [
  { key: "1x1", cols: 1, perPage: 1,  icon: "⊡" },
  { key: "2x2", cols: 2, perPage: 4,  icon: "⊞" },
  { key: "3x3", cols: 3, perPage: 9,  icon: "⋮⋮⋮" },
  { key: "4x4", cols: 4, perPage: 16, icon: "⣿" },
];

// ── Camera tile ────────────────────────────────────────────────────────────────
// ── Camera tile with AI overlay ────────────────────────────────────────────────
// ── Drop-in replacement for the CameraTile video section in LiveMonitoring.jsx
//
// 1. Import at top of LiveMonitoring.jsx:
//    import AuthenticatedStream from "../components/AuthenticatedStream.jsx";
//
// 2. Replace the lm-tile-video-wrap content inside CameraTile with this:

// The token comes from useAuth() — pass it down as a prop to CameraTile:
//   <CameraTile key={cam.id} cam={cam} token={token} onSelect={setSelectedCam} />

// Updated CameraTile signature:

// ── Configure Cameras modal (CRUD) ─────────────────────────────────────────────

function ConfigureCamerasModal({ cameras, token, onClose, onCamerasChanged }) {
  const [view, setView] = useState("list");  // "list" | "add" | "edit" | "confirm-delete"
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleAdd = async (data) => {
    setSaving(true);
    setFormError(null);
    try {
      await createCamera(token, {
        name: data.name,
        rtsp_url: data.rtsp_url,
        location: data.location,
        zone: data.zone,
        is_active: data.is_active,
      });
      await onCamerasChanged();
      setView("list");
    } catch (err) {
      const apiData = err.response?.data;
      if (apiData && typeof apiData === "object") {
        const firstField = Object.keys(apiData)[0];
        const fieldVal = apiData[firstField];
        const firstMsg = Array.isArray(fieldVal) ? fieldVal[0] : fieldVal;
        setFormError(firstMsg || "Failed to add camera.");
      } else {
        setFormError(err.message || "Failed to add camera.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (data) => {
    setSaving(true);
    setFormError(null);
    try {
      await updateCamera(token, selected.id, {
        name: data.name,
        rtsp_url: data.rtsp_url,
        location: data.location,
        zone: data.zone,
        is_active: data.is_active,
      });
      await onCamerasChanged();
      setView("list");
    } catch (err) {
      const apiData = err.response?.data;
      if (apiData && typeof apiData === "object") {
        const firstField = Object.keys(apiData)[0];
        const fieldVal = apiData[firstField];
        const firstMsg = Array.isArray(fieldVal) ? fieldVal[0] : fieldVal;
        setFormError(firstMsg || "Failed to update camera.");
      } else {
        setFormError(err.message || "Failed to update camera.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteCamera(token, selected.id);
      await onCamerasChanged();
      setView("list");
      setSelected(null);
    } catch {
      setFormError("Failed to delete camera.");
      setView("list");
    } finally { setDeleting(false); }
  };

  // Close on Escape only when on list view
  useEffect(() => {
    if (view !== "list") return;
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [view, onClose]);

  // ── Add / Edit form ──────────────────────────────────────────────────
  if (view === "add") {
    return (
      <CameraFormModal
        mode="add"
        onSave={handleAdd}
        onClose={() => { setView("list"); setFormError(null); }}
        saving={saving}
        error={formError}
      />
    );
  }

  if (view === "edit" && selected) {
    return (
      <CameraFormModal
        mode="edit"
        camera={selected}
        onSave={handleEdit}
        onClose={() => { setView("list"); setFormError(null); }}
        saving={saving}
        error={formError}
      />
    );
  }

  // ── Delete confirmation ──────────────────────────────────────────────
  if (view === "confirm-delete" && selected) {
    return (
      <div className="cfm-overlay" onClick={() => setView("list")}>
        <div className="lm-confirm-modal" onClick={e => e.stopPropagation()}>
          <div className="lm-confirm-icon">🗑</div>
          <h3 className="lm-confirm-title">Delete Camera?</h3>
          <p className="lm-confirm-desc">
            <strong>{selected.name}</strong> will be permanently removed from SmartGuard.
            Any associated alerts and detection records will remain in the database.
          </p>
          <div className="lm-confirm-actions">
            <button
              className="lm-modal-btn-cancel"
              onClick={() => setView("list")}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              className="lm-confirm-delete-btn"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Yes, Delete"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Camera list view ─────────────────────────────────────────────────
  return (
    <div className="lm-modal-overlay" onClick={onClose}>
      <div className="lm-config-modal" onClick={e => e.stopPropagation()}>

        <div className="lm-modal-header">
          <h2 className="lm-modal-title">⚙ Configure Cameras</h2>
          <div className="lm-config-header-actions">
            <button
              className="lm-modal-btn-primary"
              onClick={() => { setFormError(null); setView("add"); }}
            >
              + Add Camera
            </button>
            <button className="lm-modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {formError && (
          <div className="cfm-error" style={{ margin: "12px 18px 0" }}>
            <span>⚠</span> {formError}
          </div>
        )}

        <div className="lm-config-body">
          {cameras.length === 0 ? (
            <div className="lm-config-empty">
              <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
              <div>No cameras added yet.</div>
              <button
                className="lm-modal-btn-primary"
                style={{ marginTop: 12 }}
                onClick={() => setView("add")}
              >
                + Add Your First Camera
              </button>
            </div>
          ) : (
            <div className="lm-config-list">
              {cameras.map((cam, i) => {
                const isOnline = cam.status === "ONLINE" || cam.status === "online";
                return (
                  <div key={cam.id} className="lm-config-row">
                    <span className="lm-modal-cam-index">{i + 1}</span>
                    <span className={`lm-status-dot ${isOnline ? "dot-online" : "dot-offline"}`} />
                    <div className="lm-config-row-info">
                      <span className="lm-config-cam-name">{cam.name}</span>
                      <span className="lm-config-cam-meta">
                        {cam.location && <span>{cam.location}</span>}
                        {cam.zone && <span>{cam.zone}</span>}
                        {cam.stream_mjpeg_url && (
                          <span className="lm-modal-stream-badge">● LIVE</span>
                        )}
                      </span>
                    </div>
                    <span className={`lm-status-chip ${isOnline ? "chip-online" : "chip-offline"}`}>
                      {cam.status || "UNKNOWN"}
                    </span>
                    <div className="lm-config-row-actions">
                      <button
                        className="lm-config-edit-btn"
                        onClick={() => { setSelected(cam); setView("edit"); setFormError(null); }}
                        title="Edit camera"
                      >
                        ✎ Edit
                      </button>
                      <button
                        className="lm-config-delete-btn"
                        onClick={() => { setSelected(cam); setView("confirm-delete"); }}
                        title="Delete camera"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lm-modal-footer">
          <span className="lm-modal-meta">{cameras.length} camera{cameras.length !== 1 ? "s" : ""} configured</span>
          <button className="lm-modal-btn-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Fullscreen modal with zoom ─────────────────────────────────────────────────
function CameraFullscreen({ cam, onClose }) {
  console.log("[Fullscreen] token:", cam._token)
  const isOnline = cam.status === "ONLINE" || cam.status === "online";
  const hasStream = !!(cam.stream_mjpeg_url);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(null);
  const bodyRef = useRef(null);

  const MIN_ZOOM = 1, MAX_ZOOM = 5, STEP = 0.4;

  const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +z.toFixed(1)));

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setZoom(z => {
      const next = clampZoom(z + (e.deltaY < 0 ? STEP : -STEP));
      if (next === MIN_ZOOM) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const onMouseDown = (e) => {
    if (zoom <= 1) return;
    setDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };
  const onMouseMove = (e) => {
    if (!dragging || !dragStart.current) return;
    setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };
  const onMouseUp = () => { setDragging(false); dragStart.current = null; };

  const zoomIn = () => setZoom(z => clampZoom(z + STEP));
  const zoomOut = () => { setZoom(z => { const n = clampZoom(z - STEP); if (n === MIN_ZOOM) setPan({ x: 0, y: 0 }); return n; }); };
  const zoomReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  return (
    <div className="lm-modal-overlay" onClick={onClose}>
      <div className="lm-fullscreen-modal" onClick={e => e.stopPropagation()}>
        <div className="lm-modal-header">
          <div className="lm-tile-name-row">
            <span className={`lm-status-dot ${isOnline ? "dot-online" : "dot-offline"}`} />
            <h2 className="lm-modal-title">{cam.name}</h2>
            {cam.location && <span className="lm-modal-location">📍 {cam.location}</span>}
            <span className={`lm-status-chip ${isOnline ? "chip-online" : "chip-offline"}`}>{cam.status}</span>
          </div>
          <button className="lm-modal-close" onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        <div
          ref={bodyRef}
          className={`lm-fullscreen-body${zoom > 1 ? " lm-fullscreen-body--zoomed" : ""}`}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{ cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "default" }}
        >
          {hasStream ? (
            <AuthenticatedStream
              streamUrl={cam.stream_mjpeg_url}
              token={cam._token}
              alt={cam.name}
              className="lm-fullscreen-video"
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transformOrigin: "center center",
                transition: dragging ? "none" : "transform 0.15s ease",
              }}
            />
          ) : (
            <div className="lm-fullscreen-offline">
              <svg className="lm-camera-svg lm-camera-svg--lg" viewBox="0 0 48 48" fill="none">
                <rect x="4" y="12" width="32" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="20" cy="24" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M36 20l8-5v18l-8-5V20z" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span className="lm-tile-offline-label">{isOnline ? "Stream unavailable" : "Camera offline"}</span>
            </div>
          )}
        </div>

        {hasStream && (
          <div className="lm-zoom-bar">
            <div className="lm-zoom-controls">
              <button className="lm-zoom-btn" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}>−</button>
              <div className="lm-zoom-track">
                <input
                  type="range" className="lm-zoom-slider"
                  min={MIN_ZOOM} max={MAX_ZOOM} step={STEP} value={zoom}
                  onChange={e => { const v = parseFloat(e.target.value); setZoom(v); if (v === MIN_ZOOM) setPan({ x: 0, y: 0 }); }}
                />
              </div>
              <button className="lm-zoom-btn" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}>+</button>
              <span className="lm-zoom-value">{Math.round(zoom * 100)}%</span>
              <button className="lm-zoom-reset" onClick={zoomReset} disabled={zoom === MIN_ZOOM}>Reset</button>
            </div>
            {zoom > 1 && <span className="lm-zoom-hint">Scroll to zoom · Drag to pan</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
function LiveMonitoring() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [showConfig, setShowConfig] = useState(false);
  const [selectedCam, setSelectedCam] = useState(null);
  const [gridKey, setGridKey] = useState("2x2");
  const { feed } = useAllDetections(cameras, token);
  useEffect(() => { setCurrentPage(0); }, [gridKey]);

  const loadCameras = useCallback(async () => {
    if (!token) return;
    try {
      const cams = await getCameras(token);
      setCameras(Array.isArray(cams) ? cams : []);
    } catch (e) { console.error("Failed to load cameras", e); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadCameras(); }, [loadCameras]);

  const handleLogout = () => { logout(); navigate("/login", { replace: true }); };
  const handleComingSoon = (label) => alert(`"${label}" is not yet implemented.`);

  const activeGrid = GRID_OPTIONS.find(g => g.key === gridKey) ?? GRID_OPTIONS[1];
  const totalPages = Math.ceil(cameras.length / activeGrid.perPage);
  const pageStart = currentPage * activeGrid.perPage;
  const visibleCams = cameras.slice(pageStart, pageStart + activeGrid.perPage);
  const onlineCount = cameras.filter(c => c.status === "ONLINE" || c.status === "online").length;

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
              <Link key={item.id} to={item.path} className={`sg-nav-item${item.id === "live" ? " sg-nav-active" : ""}`}>
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
              <span className="sg-breadcrumb-current">Live Monitoring</span>
            </div>
          </div>
          <div className="sg-topbar-right">
            <button className="lm-settings-btn" onClick={() => setShowConfig(true)}>
              ⚙ Configure Cameras
            </button>
          </div>
        </header>

        <div className="sg-content">
          <div className="lm-page-header">
            <div>
              <h1 className="sg-page-title">Live Monitoring</h1>
              {!loading && (
                <p className="lm-page-subtitle">
                  {onlineCount} of {cameras.length} camera{cameras.length !== 1 ? "s" : ""} online
                  {totalPages > 1 && ` · Page ${currentPage + 1} of ${totalPages}`}
                </p>
              )}
            </div>
            {totalPages > 1 && (
              <div className="lm-pagination">
                <button className="lm-page-btn" onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}>← Prev</button>
                <div className="lm-page-dots">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button key={i} className={`lm-page-dot${i === currentPage ? " lm-page-dot--active" : ""}`} onClick={() => setCurrentPage(i)} />
                  ))}
                </div>
                <button className="lm-page-btn" onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage === totalPages - 1}>Next →</button>
              </div>
            )}
          </div>

          <section className="sg-card lm-grid-card">
            <div className="sg-card-header">
              <h2 className="sg-card-title">
                Live Cameras
                {!loading && cameras.length > 0 && (
                  <span className="lm-cam-count">{pageStart + 1}–{Math.min(pageStart + activeGrid.perPage, cameras.length)} of {cameras.length}</span>
                )}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", gap: 2, background: "var(--bg-elevated)", borderRadius: 6, padding: 3, border: "1px solid var(--border)" }}>
                  {GRID_OPTIONS.map(g => (
                    <button
                      key={g.key}
                      onClick={() => setGridKey(g.key)}
                      title={`${g.key} grid`}
                      style={{
                        padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11,
                        fontWeight: 600, border: "none",
                        background: gridKey === g.key ? "var(--accent-blue)" : "transparent",
                        color: gridKey === g.key ? "#fff" : "var(--text-muted)",
                        transition: "all 0.15s",
                      }}
                    >
                      {g.key}
                    </button>
                  ))}
                </div>
                <button className="lm-settings-icon-btn" onClick={() => setShowConfig(true)} title="Configure cameras">⚙</button>
              </div>
            </div>

            {loading ? (
              <div className="sg-loading"><div className="sg-spinner" /> Loading cameras...</div>
            ) : cameras.length === 0 ? (
              <div className="sg-empty">
                No cameras configured.{" "}
                <button className="lm-inline-add-btn" onClick={() => setShowConfig(true)}>Add a camera →</button>
              </div>
            ) : (
              <div
                className="lm-grid"
                style={{ gridTemplateColumns: `repeat(${activeGrid.cols}, 1fr)` }}
              >
                {visibleCams.map(cam => (
                  <CameraTile key={cam.id} cam={cam} token={token} onSelect={setSelectedCam} paused={selectedCam?.id === cam.id} onDetection={() => { }} />
                ))}
                {visibleCams.length < activeGrid.perPage &&
                  Array.from({ length: activeGrid.perPage - visibleCams.length }).map((_, i) => (
                    <div key={`empty-${i}`} className="lm-tile lm-tile--empty" />
                  ))
                }
              </div>
            )}
          </section>

          {totalPages > 1 && (
            <div className="lm-pagination lm-pagination--bottom">
              <button className="lm-page-btn" onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}>← Previous Page</button>
              <span className="lm-page-label">{currentPage + 1} / {totalPages}</span>
              <button className="lm-page-btn" onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage === totalPages - 1}>Next Page →</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showConfig && <ConfigureCamerasModal cameras={cameras} token={token} onClose={() => setShowConfig(false)} onCamerasChanged={loadCameras} />}
      {selectedCam && (
        <CameraFullscreen
          cam={{ ...selectedCam, _token: token }}
          onClose={() => setSelectedCam(null)}
        />
      )}
       <AlertToast detections={feed} />
    </div>
  );
}

export default LiveMonitoring;
