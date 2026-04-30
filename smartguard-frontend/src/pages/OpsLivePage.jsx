// src/pages/OpsLivePage.jsx
// Live monitoring for Operations Manager — same camera grid as Admin
// but read-only (no camera management controls)

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import OpsLayout from "./OpsLayout.jsx";
import CameraTile from "./CameraTile.jsx";
import AlertToast from "../components/AlertToast.jsx";
import { useAllDetections } from "../hooks/useAllDetections.js";
import { getCameras } from "../api/cameraApi.js";
import AuthenticatedStream from "../components/AuthenticatedStream.jsx";
import "./AdminDashboard.css";
import "./LiveMonitoring.css";

const GRID_OPTIONS = [
  { key: "1x1", cols: 1, perPage: 1  },
  { key: "2x2", cols: 2, perPage: 4  },
  { key: "3x3", cols: 3, perPage: 9  },
  { key: "4x4", cols: 4, perPage: 16 },
];

function CameraFullscreen({ cam, token, onClose }) {
  const isOnline  = cam.status === "ONLINE" || cam.status === "online";
  const hasStream = !!(cam.stream_mjpeg_url);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

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
          <button className="lm-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="lm-fullscreen-body">
          {hasStream ? (
            <AuthenticatedStream streamUrl={cam.stream_mjpeg_url} token={token} alt={cam.name} className="lm-fullscreen-video" />
          ) : (
            <div className="lm-fullscreen-offline">
              <svg className="lm-camera-svg lm-camera-svg--lg" viewBox="0 0 48 48" fill="none">
                <rect x="4" y="12" width="32" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="20" cy="24" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M36 20l8-5v18l-8-5V20z" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span className="lm-tile-offline-label">{isOnline ? "No stream configured" : "Camera offline"}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OpsLivePage() {
  const { token } = useAuth();
  const [cameras,     setCameras]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [gridKey,     setGridKey]     = useState("2x2");
  const [page,        setPage]        = useState(0);
  const [selectedCam, setSelectedCam] = useState(null);
  const [collapsed,   setCollapsed]   = useState(false);

  const loadCameras = useCallback(async () => {
    if (!token) return;
    try {
      const cams = await getCameras(token);
      setCameras(Array.isArray(cams) ? cams : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadCameras(); }, [loadCameras]);

  const { feed } = useAllDetections(cameras, token);

  const grid       = GRID_OPTIONS.find(g => g.key === gridKey) ?? GRID_OPTIONS[1];
  const totalPages = Math.ceil(cameras.length / grid.perPage);
  const visible    = cameras.slice(page * grid.perPage, (page + 1) * grid.perPage);
  const online     = cameras.filter(c => c.status === "ONLINE" || c.status === "online").length;

  const topbarRight = (
    <div style={{ display: "flex", gap: 6, background: "var(--bg-elevated)", borderRadius: 6, padding: 3, border: "1px solid var(--border)" }}>
      {GRID_OPTIONS.map(g => (
        <button key={g.key} onClick={() => { setGridKey(g.key); setPage(0); }} style={{
          padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 600, border: "none",
          background: gridKey === g.key ? "var(--accent-blue)" : "transparent",
          color: gridKey === g.key ? "#fff" : "var(--text-muted)", transition: "all 0.15s",
        }}>{g.key}</button>
      ))}
    </div>
  );

  return (
    <OpsLayout active="live" title="Live Monitoring"
      subtitle={loading ? "Loading cameras…" : `${online} of ${cameras.length} cameras online`}
      topbarRight={topbarRight}
      sidebarCollapsed={collapsed}
      onToggleSidebar={() => setCollapsed(p => !p)}
    >
      <section className="sg-card" style={{ padding: "16px 18px 18px" }}>
        {loading ? (
          <div className="sg-loading"><div className="sg-spinner" /> Loading cameras…</div>
        ) : cameras.length === 0 ? (
          <div className="sg-empty">No cameras are available for your account.</div>
        ) : (
          <>
            <div className="lm-grid" style={{ gridTemplateColumns: `repeat(${grid.cols}, 1fr)` }}>
              {visible.map(cam => (
                <CameraTile key={cam.id} cam={cam} token={token}
                  onSelect={setSelectedCam} paused={false} onDetection={() => {}} />
              ))}
              {visible.length < grid.perPage && Array.from({ length: grid.perPage - visible.length }).map((_, i) => (
                <div key={`e-${i}`} className="lm-tile lm-tile--empty" />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="lm-pagination lm-pagination--bottom">
                <button className="lm-page-btn" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Prev</button>
                <span className="lm-page-label">{page + 1} / {totalPages}</span>
                <button className="lm-page-btn" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}>Next →</button>
              </div>
            )}
          </>
        )}
      </section>

      {selectedCam && (
        <CameraFullscreen cam={{ ...selectedCam }} token={token} onClose={() => setSelectedCam(null)} />
      )}

      <AlertToast detections={feed} />
    </OpsLayout>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// OpsEvidencePage.jsx — read-only evidence viewer for Ops Manager
// FRS 2.D: Ops can access clips for classification; no download without Admin.
// ─────────────────────────────────────────────────────────────────────────────
// This is in the same file for brevity — split into OpsEvidencePage.jsx

export function OpsEvidencePage() {
  const [collapsed, setCollapsed] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Same sample data structure as EvidenceVault (filtered to ops-accessible items)
  const EVIDENCE = [
    { id: "EVD-20260227-0041", date: "2026-02-27", time: "01:30 PM", camera: "CAM-04", camera_name: "Self-Checkout — Zone GF", behavior: "CONCEALMENT",  severity: "MEDIUM",   confidence: 76, duration: "0:30", size: "14.2 MB", alert_status: "NEW"       },
    { id: "EVD-20260227-0040", date: "2026-02-27", time: "10:34 AM", camera: "CAM-01", camera_name: "Entrance — Zone A",       behavior: "CONCEALMENT",  severity: "HIGH",     confidence: 90, duration: "0:30", size: "28.7 MB", alert_status: "ESCALATED"  },
    { id: "EVD-20260227-0039", date: "2026-02-27", time: "10:12 AM", camera: "CAM-03", camera_name: "Aisle 1 — Zone GF",      behavior: "RAPID_EXIT",   severity: "CRITICAL", confidence: 95, duration: "0:30", size: "41.3 MB", alert_status: "ESCALATED"  },
    { id: "EVD-20260226-0037", date: "2026-02-26", time: "04:22 PM", camera: "CAM-08", camera_name: "Electronics — Zone 2F",  behavior: "LOITERING",    severity: "MEDIUM",   confidence: 62, duration: "0:30", size: "11.1 MB", alert_status: "CLOSED"     },
    { id: "EVD-20260226-0036", date: "2026-02-26", time: "01:05 PM", camera: "CAM-04", camera_name: "Self-Checkout — Zone GF", behavior: "LOITERING",   severity: "LOW",      confidence: 58, duration: "0:30", size: "52.0 MB", alert_status: "FALSE_POSITIVE" },
  ];

  const BEHAVIOR_DISPLAY = { CONCEALMENT: "Concealment", LOITERING: "Loitering", RAPID_EXIT: "Rapid Exit", SHOPLIFTING: "Shoplifting" };
  const STATUS_LABELS    = { NEW: "New", ESCALATED: "Escalated", FALSE_POSITIVE: "False Positive", CLOSED: "Closed" };

  const filtered = EVIDENCE.filter(e => {
    if (statusFilter !== "ALL" && e.alert_status !== statusFilter) return false;
    if (search && ![e.id, e.camera_name, e.behavior, e.camera].join(" ").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <OpsLayout active="evidence" title="Evidence Clips"
      subtitle="Read-only access — download requests require Administrator approval"
      sidebarCollapsed={collapsed}
      onToggleSidebar={() => setCollapsed(p => !p)}
    >
      {/* FRS notice */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", marginBottom: 16,
        background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.15)",
        borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text-secondary)",
      }}>
        <span>🔒</span>
        <span>
          You have read-only access to evidence clips for your assigned cameras.
          To download a clip, use <strong>Request Download</strong> — an Administrator will approve it.
        </span>
      </div>

      <div className="sg-card">
        {/* Filters */}
        <div className="det-filters-bar">
          <div className="det-search-wrap" style={{ flex: 1 }}>
            <span className="det-search-icon">🔍</span>
            <input className="det-search" placeholder="Search by ID, camera, or behavior..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="det-filter-group">
            <label className="det-filter-label">Alert Status</label>
            <div className="det-filter-tabs">
              {["ALL","NEW","ESCALATED","FALSE_POSITIVE","CLOSED"].map(s => (
                <button key={s} className={`det-filter-tab${statusFilter === s ? " det-filter-tab--active" : ""}`}
                  onClick={() => setStatusFilter(s)}>
                  {s === "FALSE_POSITIVE" ? "FALSE POS." : s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="sg-table-wrap">
          <table className="sg-table">
            <thead>
              <tr><th>CLIP ID</th><th>DATE / TIME</th><th>CAMERA</th><th>BEHAVIOR</th><th>ALERT STATUS</th><th>DURATION</th><th>SIZE</th><th>ACTIONS</th></tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id}>
                  <td style={{ fontFamily: "'Space Mono',monospace", fontSize: 10, color: "var(--accent-blue)", fontWeight: 700 }}>{e.id}</td>
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
                  <td style={{ fontWeight: 600 }}>{BEHAVIOR_DISPLAY[e.behavior] || e.behavior}</td>
                  <td><span className={`sg-chip sg-stat-${e.alert_status}`}>{STATUS_LABELS[e.alert_status]}</span></td>
                  <td className="sg-td-mono">{e.duration}</td>
                  <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{e.size}</td>
                  <td>
                    <div className="det-action-btns">
                      <button className="det-btn det-btn--view" onClick={() => alert(`Viewing evidence clip ${e.id}`)}>View</button>
                      <button className="det-btn det-btn--request" onClick={() => alert(`Download request submitted for ${e.id}`)}>
                        Request Download
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="det-table-footer">
          <span className="det-count-label">Showing {filtered.length} of {EVIDENCE.length} clips</span>
        </div>
      </div>
    </OpsLayout>
  );
}