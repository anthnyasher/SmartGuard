// src/pages/EvidenceVault.jsx
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getEvidence, verifyEvidence } from "../api/evidenceApi.js";
import "./AdminDashboard.css";
import "./shared-components.css";
import "./EvidenceVault.css";

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

export default function EvidenceVault() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [search, setSearch]           = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [selected, setSelected]       = useState(null);
  const [viewMode, setViewMode]       = useState("table");
  const [downloadRequested, setDownloadRequested] = useState(new Set());
  const [evidenceClips, setEvidenceClips] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Fetch evidence from API ────────────────────────────────────────────────
  useEffect(() => {
    async function fetchEvidence() {
      try {
        const data = await getEvidence(token);
        setEvidenceClips(data);
      } catch (err) {
        console.error("Failed to fetch evidence:", err);
        setEvidenceClips([]);
      } finally {
        setLoading(false);
      }
    }
    if (token) fetchEvidence();
  }, [token]);

  const handleLogout = () => { logout(); navigate("/login", { replace: true }); };

  const isAdmin = user?.role === "ADMIN";

  const filtered = evidenceClips.filter(e => {
    if (severityFilter !== "ALL" && e.alert_status !== severityFilter) return false;
    if (search && ![e.clip_id || "", e.camera_name || "", e.behavior_type || ""].join(" ").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalSizeMB = evidenceClips.reduce((acc, e) => acc + (e.file_size_mb || 0), 0).toFixed(1);

  // ADMIN: direct download | OPS: submit request
  const handleDownload = (ev) => {
    if (isAdmin) {
      // Direct download via authenticated fetch
      window.open(`http://localhost:8000/api/evidence/${ev.id}/download/`, "_blank");
    } else {
      setDownloadRequested(prev => new Set([...prev, ev.id]));
      alert(`Download request submitted for ${ev.clip_id || ev.id}. An administrator will review and approve it.`);
    }
  };

  const handleVerify = async (ev) => {
    try {
      const result = await verifyEvidence(token, ev.id);
      alert(`Integrity check ${result.integrity_status} for ${result.clip_id}.\nSHA-256: ${result.sha256_hash}`);
      // Refresh the clip in local state
      setEvidenceClips(prev => prev.map(c => c.id === ev.id ? { ...c, integrity_status: result.integrity_status } : c));
    } catch (err) {
      alert("Integrity verification failed.");
    }
  };

  const ALERT_STATUS_LABELS = {
    NEW: "New", ESCALATED: "Escalated", FALSE_POSITIVE: "False Positive", CLOSED: "Closed",
  };

  return (
    <div className="sg-layout">
      <aside className={`sg-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sg-sidebar-logo">
          <div className="sg-logo-icon">🛡</div>
          {!sidebarCollapsed && <span className="sg-logo-text"><span className="sg-logo-smart">SMART</span><span className="sg-logo-guard">GUARD</span></span>}
        </div>
        <nav className="sg-sidebar-nav">
          {NAV_ITEMS.map(item => (
            <Link key={item.id} to={item.path} className={`sg-nav-item${item.id === "evidence" ? " sg-nav-active" : ""}`}>
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
              <span className="sg-breadcrumb-current">Evidence Vault</span>
            </div>
          </div>
        </header>

        <div className="sg-content">
          <h1 className="sg-page-title">Evidence Vault</h1>

          <div className="sg-kpi-strip" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 20 }}>
            {[
              { label: "Total Clips",     val: evidenceClips.length,                                     icon: "🎞", cls: "kpi-blue",   iconCls: "kpi-icon-blue"   },
              { label: "Total Size",      val: `${totalSizeMB} MB`,                                        icon: "💾", cls: "kpi-purple", iconCls: "kpi-icon-purple" },
              { label: "Verified Clips",  val: evidenceClips.filter(e => e.integrity_status === "VERIFIED").length, icon: "🔐", cls: "kpi-green",  iconCls: "kpi-icon-green" },
              { label: "Total Clips",     val: evidenceClips.length,                                     icon: "🔒", cls: "kpi-amber",  iconCls: "kpi-icon-amber"  },
            ].map(k => (
              <div key={k.label} className={`sg-kpi ${k.cls}`}>
                <div className={`sg-kpi-icon-wrap ${k.iconCls}`}>{k.icon}</div>
                <div><div className="sg-kpi-val">{k.val}</div><div className="sg-kpi-label">{k.label}</div></div>
              </div>
            ))}
          </div>

          <div className="sg-card">
            <div className="det-filters-bar">
              <div className="det-search-wrap" style={{ flex: 1 }}>
                <span className="det-search-icon">🔍</span>
                <input className="det-search" placeholder="Search by ID, camera, or behavior..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="det-filter-group">
                <label className="det-filter-label">Alert Status</label>
                <div className="det-filter-tabs">
                  {["ALL","NEW","ESCALATED","FALSE_POSITIVE","CLOSED"].map(s => (
                    <button key={s} className={`det-filter-tab${severityFilter === s ? " det-filter-tab--active" : ""}`} onClick={() => setSeverityFilter(s)}>
                      {s === "FALSE_POSITIVE" ? "FALSE POS." : s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ev-view-toggle">
                <button className={`ev-view-btn${viewMode === "table" ? " ev-view-btn--active" : ""}`} onClick={() => setViewMode("table")}>☰ Table</button>
                <button className={`ev-view-btn${viewMode === "grid" ? " ev-view-btn--active" : ""}`} onClick={() => setViewMode("grid")}>⊞ Grid</button>
              </div>
            </div>

            {viewMode === "table" && (
              <div className="sg-table-wrap">
                <table className="sg-table">
                  <thead>
                    <tr>
                      <th>CLIP ID</th><th>DATE / TIME</th><th>CAMERA</th>
                      <th>BEHAVIOR</th><th>ALERT STATUS</th><th>DURATION</th>
                      <th>EXPIRES</th><th>INTEGRITY</th><th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(e => (
                      <tr key={e.id} className={selected?.id === e.id ? "det-row--selected" : ""} onClick={() => setSelected(e)} style={{ cursor: "pointer" }}>
                        <td><span className="ev-id">{e.id}</span></td>
                        <td>
                          <div className="det-cam-cell">
                            <span className="det-cam-id">{e.date}</span>
                            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{e.time}</span>
                          </div>
                        </td>
                        <td>
                          <div className="det-cam-cell">
                            <span className="det-cam-id">{e.camera}</span>
                            <span className="det-cam-name">{e.camera_name}</span>
                          </div>
                        </td>
                        <td className="sg-td-bold">{e.behavior.replace("_", " ")}</td>
                        <td>
                          <span className={`sg-chip sg-stat-${e.alert_status}`}>
                            {ALERT_STATUS_LABELS[e.alert_status] || e.alert_status}
                          </span>
                        </td>
                        <td className="sg-td-mono">{e.duration}</td>
                        <td style={{ fontSize: 10, color: "var(--text-muted)" }}>
                          {e.alert_status === "NEW"            && "7d if no action"}
                          {e.alert_status === "FALSE_POSITIVE" && "24h after tagging"}
                          {e.alert_status === "ESCALATED"      && "⚠ Held — pending handover"}
                          {e.alert_status === "CLOSED"         && "24h after closure"}
                        </td>
                        <td><span className="ev-verified-badge">✓ Verified</span></td>
                        <td onClick={ev => ev.stopPropagation()}>
                          <div className="det-action-btns">
                            <button className="det-btn det-btn--view" onClick={() => setSelected(e)}>View</button>
                            {downloadRequested.has(e.id) ? (
                              <span className="det-btn det-btn--ghost" style={{ opacity: 0.5 }}>Requested</span>
                            ) : (
                              <button
                                className={`det-btn ${isAdmin ? "det-btn--review" : "det-btn--request"}`}
                                onClick={() => handleDownload(e)}
                                title={isAdmin ? "Download clip" : "Request download approval from Admin"}
                              >
                                {isAdmin ? "↓ Download" : "Request"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {viewMode === "grid" && (
              <div className="ev-grid">
                {filtered.map(e => (
                  <div key={e.id} className={`ev-card${selected?.id === e.id ? " ev-card--selected" : ""}`} onClick={() => setSelected(e)}>
                    <div className="ev-card-thumb">
                      <div className="ev-thumb-placeholder"><span style={{ fontSize: 24 }}>🎞</span></div>
                      <span className="ev-duration-badge">{e.duration}</span>
                    </div>
                    <div className="ev-card-body">
                      <div className="ev-card-id">{e.id}</div>
                      <div className="ev-card-meta">{e.camera_name} · {e.time}</div>
                      <div className="ev-card-footer">
                        <span className={`sg-chip sg-sev-${e.severity}`}>{e.severity}</span>
                        <span className="ev-verified-badge">✓</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="det-table-footer">
              <span className="det-count-label">Showing {filtered.length} of {evidenceClips.length} clips</span>
            </div>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="det-detail-panel">
          <div className="det-detail-header">
            <span className="det-detail-title">Clip Details</span>
            <button className="lm-modal-close" onClick={() => setSelected(null)}>✕</button>
          </div>
          <div className="det-detail-body">
            <div className="det-detail-preview">
              <div className="det-detail-thumb-placeholder">
                <span style={{ fontSize: 32 }}>🎞</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>Video clip preview</span>
                {/* TODO: Replace with <video> pointing to GET /api/evidence/<id>/stream/ */}
              </div>
            </div>
            <div className="det-detail-rows">
              {[
                ["Clip ID",       selected.id],
                ["Camera",        `${selected.camera} — ${selected.camera_name}`],
                ["Behavior",      selected.behavior],
                ["Severity",      selected.severity],
                ["Confidence",    `${selected.confidence}%`],
                ["Date",          selected.date],
                ["Time",          selected.time],
                ["Duration",      selected.duration],
                ["File Size",     selected.size],
                ["Encryption",    "AES-256"],
                ["Alert Status",  ALERT_STATUS_LABELS[selected.alert_status] || selected.alert_status],
                ["Integrity",     "Verified"],
              ].map(([k, v]) => (
                <div key={k} className="det-detail-row">
                  <span className="det-detail-key">{k}</span>
                  <span className="det-detail-val">{v}</span>
                </div>
              ))}
            </div>
            <div className="ev-hash-full">
              <div className="det-detail-key" style={{ marginBottom: 6 }}>File Integrity Check</div>
              <div className="ev-hash-full-val">
                {/* TODO: Load real hash from GET /api/evidence/<id>/ */}
                a3f8c2d1e94b7605f21a3d8c9e4f5b2a1c7d6e3f0b9a8c7d6e5f4a3b2c1d0e9f8
              </div>
              <button className="ev-verify-btn" onClick={() => handleVerify(selected)}>
                🔍 Verify Integrity
              </button>
            </div>
            <div className="det-detail-actions">
              {downloadRequested.has(selected.id) ? (
                <button className="det-btn-full det-btn-full--ghost" disabled>
                  ✓ Download Requested
                </button>
              ) : (
                <button
                  className={`det-btn-full ${isAdmin ? "det-btn-full--primary" : "det-btn-full--ghost"}`}
                  onClick={() => handleDownload(selected)}
                >
                  {isAdmin ? "↓ Download Clip" : "Request Download"}
                </button>
              )}
              <button className="det-btn-full det-btn-full--ghost" onClick={() => navigate("/admin/detections")}>
                View Original Alert →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}