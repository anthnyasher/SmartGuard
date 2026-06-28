// src/pages/EvidenceVault.jsx
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getEvidence, verifyEvidence, reviewEvidence, getEvidenceStats } from "../api/evidenceApi.js";
import "./AdminDashboard.css";
import "./shared-components.css";
import "./EvidenceVault.css";
import useDocumentTitle from "../utils/useDocumentTitle.js";

const ADMIN_NAV_ITEMS = [
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

const OPS_NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard",       icon: "⊞", path: "/ops/dashboard" },
  { id: "live",      label: "Live Monitoring", icon: "◉", path: "/ops/live"      },
  { id: "alerts",    label: "Alerts & Events", icon: "✦", path: "/ops/alerts"    },
  { id: "evidence",  label: "Evidence Vault",  icon: "🔒", path: "/ops/evidence"  },
];

const REVIEW_STATUS_LABELS = {
  PENDING: "Pending Review",
  CONFIRMED: "Confirmed",
  FALSE_POSITIVE: "False Positive",
};

const REVIEW_STATUS_CLASSES = {
  PENDING: "sg-review-pending",
  CONFIRMED: "sg-review-confirmed",
  FALSE_POSITIVE: "sg-review-fp",
};

function formatTimeUntilExpiry(seconds) {
  if (seconds == null) return "No expiry";
  if (seconds <= 0) return "Expired";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function EvidenceVault() {
  useDocumentTitle("Evidence Vault");
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth <= 768);
  const [search, setSearch]                 = useState("");
  const [reviewFilter, setReviewFilter]     = useState("ALL");
  const [selected, setSelected]             = useState(null);
  const [viewMode, setViewMode]             = useState("table");
  const [downloadRequested, setDownloadRequested] = useState(new Set());
  const [evidenceClips, setEvidenceClips]   = useState([]);
  const [stats, setStats]                   = useState(null);
  const [loading, setLoading]               = useState(true);
  const [reviewLoading, setReviewLoading]   = useState(false);

  // ── Fetch evidence from API ────────────────────────────────────────────────
  const fetchEvidence = async () => {
    try {
      const params = {};
      if (reviewFilter !== "ALL") params.review_status = reviewFilter;
      const data = await getEvidence(token, params);
      setEvidenceClips(data);
    } catch (err) {
      console.error("Failed to fetch evidence:", err);
      setEvidenceClips([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const s = await getEvidenceStats(token);
      setStats(s);
    } catch (err) {
      console.error("Failed to fetch evidence stats:", err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchEvidence();
      fetchStats();
    }
  }, [token, reviewFilter]);

  const handleLogout = () => { logout(); navigate("/login", { replace: true }); };

  const isAdminOrOps = user?.role === "ADMIN" || user?.role === "OPS_MANAGER";

  const filtered = evidenceClips.filter(e => {
    if (search && ![e.clip_id || "", e.camera_name || "", e.behavior_type || ""].join(" ").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalSizeMB = stats?.total_size_mb ?? evidenceClips.reduce((acc, e) => acc + (e.file_size_mb || 0), 0).toFixed(1);

  // ADMIN: direct download | OPS: submit request
  const handleDownload = (ev) => {
    if (user?.role === "ADMIN") {
      window.open(`${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/api/evidence/${ev.id}/download/`, "_blank");
    } else {
      setDownloadRequested(prev => new Set([...prev, ev.id]));
      alert(`Download request submitted for ${ev.clip_id || ev.id}. An administrator will review and approve it.`);
    }
  };

  const handleVerify = async (ev) => {
    try {
      const result = await verifyEvidence(token, ev.id);
      alert(`Integrity check ${result.integrity_status} for ${result.clip_id}.\nSHA-256: ${result.sha256_hash}`);
      setEvidenceClips(prev => prev.map(c => c.id === ev.id ? { ...c, integrity_status: result.integrity_status } : c));
    } catch (err) {
      alert("Integrity verification failed.");
    }
  };

  const handleReview = async (ev, reviewStatus) => {
    if (!isAdminOrOps) return;
    const action = reviewStatus === "CONFIRMED" ? "confirm as a positive incident" : "mark as false positive (file will be deleted)";
    if (!confirm(`Are you sure you want to ${action} for clip ${ev.clip_id || ev.id}?`)) return;

    setReviewLoading(true);
    try {
      const result = await reviewEvidence(token, ev.id, reviewStatus);
      alert(result.message);
      // Refresh data
      await fetchEvidence();
      await fetchStats();
      // Update selected if it's the same clip
      if (selected?.id === ev.id) {
        if (reviewStatus === "FALSE_POSITIVE") {
          setSelected(null);
        } else {
          setSelected(prev => ({ ...prev, review_status: reviewStatus, expires_at: result.expires_at }));
        }
      }
    } catch (err) {
      alert("Failed to review evidence clip.");
    } finally {
      setReviewLoading(false);
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
          {(user?.role === "OPS_MANAGER" ? OPS_NAV_ITEMS : ADMIN_NAV_ITEMS).map(item => (
            <Link key={item.id} to={item.path} className={`sg-nav-item${item.id === "evidence" ? " sg-nav-active" : ""}`}>
              <span className="sg-nav-icon">{item.icon}</span>
              {!sidebarCollapsed && <span className="sg-nav-label">{item.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="sg-sidebar-footer">
          <div className="sg-user-row">
            <div className="sg-user-avatar">{user?.email?.[0]?.toUpperCase() || "A"}</div>
            {!sidebarCollapsed && <div className="sg-user-info"><div className="sg-user-name">{user?.email}</div><div className="sg-user-role">{user?.role === "OPS_MANAGER" ? "Operations Manager" : user?.role === "ADMIN" ? "Administrator" : user?.role}</div></div>}
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
              { label: "Total Clips",      val: stats?.total_clips ?? evidenceClips.length,                              icon: "🎞", cls: "kpi-blue",   iconCls: "kpi-icon-blue"   },
              { label: "Pending Review",    val: stats?.pending_review ?? "—",                                            icon: "⏳", cls: "kpi-amber",  iconCls: "kpi-icon-amber"  },
              { label: "Confirmed",         val: stats?.confirmed ?? "—",                                                 icon: "✓",  cls: "kpi-green",  iconCls: "kpi-icon-green"  },
              { label: "Encrypted (AES-256)", val: stats?.encrypted ?? evidenceClips.length,                              icon: "🔐", cls: "kpi-purple", iconCls: "kpi-icon-purple" },
            ].map(k => (
              <div key={k.label} className={`sg-kpi ${k.cls}`}>
                <div className={`sg-kpi-icon-wrap ${k.iconCls}`}>{k.icon}</div>
                <div><div className="sg-kpi-val">{k.val}</div><div className="sg-kpi-label">{k.label}</div></div>
              </div>
            ))}
          </div>

          {stats?.expiring_soon > 0 && (
            <div className="ev-expiring-banner">
              ⚠ <strong>{stats.expiring_soon} clip{stats.expiring_soon > 1 ? "s" : ""}</strong> expiring within 6 hours — review them to prevent auto-deletion.
            </div>
          )}

          <div className="sg-card">
            <div className="det-filters-bar">
              <div className="det-search-wrap" style={{ flex: 1 }}>
                <span className="det-search-icon">🔍</span>
                <input className="det-search" placeholder="Search by ID, camera, or behavior..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="det-filter-group">
                <label className="det-filter-label">Review Status</label>
                <div className="det-filter-tabs">
                  {["ALL","PENDING","CONFIRMED","FALSE_POSITIVE"].map(s => (
                    <button key={s} className={`det-filter-tab${reviewFilter === s ? " det-filter-tab--active" : ""}`} onClick={() => setReviewFilter(s)}>
                      {s === "FALSE_POSITIVE" ? "FALSE POS." : s === "ALL" ? "ALL" : REVIEW_STATUS_LABELS[s] || s}
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
                      <th>BEHAVIOR</th><th>REVIEW STATUS</th><th>DURATION</th>
                      <th>EXPIRES IN</th><th>INTEGRITY</th><th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(e => (
                      <tr key={e.id} className={selected?.id === e.id ? "det-row--selected" : ""} onClick={() => setSelected(e)} style={{ cursor: "pointer" }}>
                        <td><span className="ev-id">{e.clip_id || `EVD-${e.id}`}</span></td>
                        <td>
                          <div className="det-cam-cell">
                            <span className="det-cam-id">{e.created_at ? new Date(e.created_at).toLocaleDateString() : "—"}</span>
                            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{e.created_at ? new Date(e.created_at).toLocaleTimeString() : ""}</span>
                          </div>
                        </td>
                        <td>
                          <div className="det-cam-cell">
                            <span className="det-cam-name">{e.camera_name}</span>
                          </div>
                        </td>
                        <td className="sg-td-bold">{(e.behavior_type || "").replace("_", " ")}</td>
                        <td>
                          <span className={`sg-chip ${REVIEW_STATUS_CLASSES[e.review_status] || ""}`}>
                            {REVIEW_STATUS_LABELS[e.review_status] || e.review_status}
                          </span>
                        </td>
                        <td className="sg-td-mono">{e.duration_seconds ? `${e.duration_seconds}s` : "—"}</td>
                        <td style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {e.review_status === "CONFIRMED" && "♾ Retained"}
                          {e.review_status === "PENDING" && formatTimeUntilExpiry(e.time_until_expiry)}
                          {e.review_status === "FALSE_POSITIVE" && "Deleted"}
                        </td>
                        <td>
                          <span className={`ev-verified-badge ${e.integrity_status === "VERIFIED" ? "" : "ev-badge-pending"}`}>
                            {e.integrity_status === "VERIFIED" ? "✓ Verified" : e.integrity_status === "FAILED" ? "✗ Failed" : "… Pending"}
                          </span>
                        </td>
                        <td onClick={ev => ev.stopPropagation()}>
                          <div className="det-action-btns">
                            <button className="det-btn det-btn--view" onClick={() => setSelected(e)}>View</button>
                            {isAdminOrOps && e.review_status === "PENDING" && (e.time_until_expiry == null || e.time_until_expiry > 0) && (
                              <>
                                <button
                                  className="det-btn det-btn--confirm"
                                  onClick={() => handleReview(e, "CONFIRMED")}
                                  disabled={reviewLoading}
                                  title="Confirm as positive incident"
                                >
                                  ✓
                                </button>
                                <button
                                  className="det-btn det-btn--reject"
                                  onClick={() => handleReview(e, "FALSE_POSITIVE")}
                                  disabled={reviewLoading}
                                  title="Mark as false positive (deletes clip)"
                                >
                                  ✗
                                </button>
                              </>
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
                      <span className="ev-duration-badge">{e.duration_seconds ? `${e.duration_seconds}s` : "—"}</span>
                      {e.is_encrypted && <span className="ev-encrypted-badge">🔐 AES-256</span>}
                    </div>
                    <div className="ev-card-body">
                      <div className="ev-card-id">{e.clip_id || `EVD-${e.id}`}</div>
                      <div className="ev-card-meta">{e.camera_name} · {e.created_at ? new Date(e.created_at).toLocaleTimeString() : ""}</div>
                      <div className="ev-card-footer">
                        <span className={`sg-chip ${REVIEW_STATUS_CLASSES[e.review_status] || ""}`}>
                          {REVIEW_STATUS_LABELS[e.review_status] || e.review_status}
                        </span>
                        {e.integrity_status === "VERIFIED" && <span className="ev-verified-badge">✓</span>}
                      </div>
                      {isAdminOrOps && e.review_status === "PENDING" && (
                        <div className="ev-card-review-btns" onClick={ev => ev.stopPropagation()}>
                          <button className="det-btn det-btn--confirm" onClick={() => handleReview(e, "CONFIRMED")} disabled={reviewLoading}>Confirm</button>
                          <button className="det-btn det-btn--reject" onClick={() => handleReview(e, "FALSE_POSITIVE")} disabled={reviewLoading}>Reject</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="det-table-footer">
              <span className="det-count-label">Showing {filtered.length} of {evidenceClips.length} clips</span>
              {stats && <span className="det-count-label" style={{ marginLeft: 16 }}>Total: {stats.total_size_mb} MB on disk</span>}
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
              {selected.review_status !== "FALSE_POSITIVE" ? (
                <video
                  className="ev-video-player"
                  controls
                  preload="metadata"
                  src={`${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/api/evidence/${selected.id}/stream/`}
                  key={selected.id}
                >
                  Your browser does not support video playback.
                </video>
              ) : (
                <div className="det-detail-thumb-placeholder">
                  <span style={{ fontSize: 32 }}>🚫</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>Clip deleted (false positive)</span>
                </div>
              )}
            </div>
            <div className="det-detail-rows">
              {[
                ["Clip ID",        selected.clip_id || `EVD-${selected.id}`],
                ["Camera",         selected.camera_name],
                ["Behavior",       selected.behavior_type],
                ["Severity",       selected.severity],
                ["Confidence",     `${Math.round((selected.confidence || 0) * 100)}%`],
                ["Created",        selected.created_at ? new Date(selected.created_at).toLocaleString() : "—"],
                ["Duration",       `${selected.duration_seconds || 0}s`],
                ["File Size",      `${selected.file_size_mb || 0} MB`],
                ["Resolution",     selected.resolution || "—"],
                ["Encryption",     selected.is_encrypted ? "AES-256-GCM ✓" : "None"],
                ["Review Status",  REVIEW_STATUS_LABELS[selected.review_status] || selected.review_status],
                ["Reviewed By",    selected.reviewed_by_username || "—"],
                ["Reviewed At",    selected.reviewed_at ? new Date(selected.reviewed_at).toLocaleString() : "—"],
                ["Expires",        selected.review_status === "CONFIRMED" ? "Retained indefinitely" : selected.time_until_expiry != null ? formatTimeUntilExpiry(selected.time_until_expiry) : "—"],
              ].map(([k, v]) => (
                <div key={k} className="det-detail-row">
                  <span className="det-detail-key">{k}</span>
                  <span className="det-detail-val">{v}</span>
                </div>
              ))}
            </div>
            <div className="ev-hash-full">
              <div className="det-detail-key" style={{ marginBottom: 6 }}>File Integrity Check (SHA-256)</div>
              <div className="ev-hash-full-val">
                {selected.sha256_hash || "Hash not yet computed"}
              </div>
              <button className="ev-verify-btn" onClick={() => handleVerify(selected)}>
                🔍 Verify Integrity
              </button>
            </div>

            {/* Review actions */}
            {isAdminOrOps && selected.review_status === "PENDING" && (selected.time_until_expiry == null || selected.time_until_expiry > 0) && (
              <div className="ev-review-actions">
                <div className="det-detail-key" style={{ marginBottom: 8 }}>Review Decision</div>
                <button
                  className="det-btn-full det-btn-full--confirm"
                  onClick={() => handleReview(selected, "CONFIRMED")}
                  disabled={reviewLoading}
                >
                  ✓ Confirm as Positive Incident
                </button>
                <button
                  className="det-btn-full det-btn-full--reject"
                  onClick={() => handleReview(selected, "FALSE_POSITIVE")}
                  disabled={reviewLoading}
                >
                  ✗ Mark as False Positive
                </button>
                <p className="ev-review-hint">
                  Confirmed clips are retained indefinitely. False positive clips are deleted immediately.
                </p>
              </div>
            )}

            {selected.review_status === "CONFIRMED" && (
              <div className="ev-review-confirmed-badge">
                ✓ Confirmed by {selected.reviewed_by_username || "Admin"} — Clip retained
              </div>
            )}

            <div className="det-detail-actions">
              {user?.role === "ADMIN" && selected.review_status !== "FALSE_POSITIVE" && (
                <button
                  className="det-btn-full det-btn-full--primary"
                  onClick={() => handleDownload(selected)}
                >
                  ↓ Download Clip (Decrypted)
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
