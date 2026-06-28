import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getCameras } from "../api/cameraApi.js";
import { useAllDetections } from "../hooks/useAllDetections.js";
import OpsLayout from "./OpsLayout.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import "./AdminDashboard.css";
import "./DetectionsPage.css";
import useDocumentTitle from "../utils/useDocumentTitle.js";

const SEVERITY_CONFIG = {
  CRITICAL: { color: "#ef4444", bg: "rgba(239,68,68,0.12)",  label: "CRITICAL" },
  HIGH:     { color: "#f97316", bg: "rgba(249,115,22,0.12)", label: "HIGH"     },
  MEDIUM:   { color: "#eab308", bg: "rgba(234,179,8,0.12)",  label: "MEDIUM"   },
  LOW:      { color: "#3b82f6", bg: "rgba(59,130,246,0.12)", label: "LOW"      },
};

function formatTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d)) return "—";
  
  const now = new Date();
  const isToday = d.getDate() === now.getDate() && 
                  d.getMonth() === now.getMonth() && 
                  d.getFullYear() === now.getFullYear();
                  
  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  
  if (isToday) return `Today, ${timeStr}`;
  
  const dateStr = d.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dateStr}, ${timeStr}`;
}

function SeverityBadge({ severity }) {
  const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.HIGH;
  return (
    <span className="dp-severity"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}40` }}>
      {cfg.label}
    </span>
  );
}

function SnapshotModal({ event, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const cfg = SEVERITY_CONFIG[event.severity] ?? SEVERITY_CONFIG.HIGH;
  return (
    <div className="dp-snap-overlay" onClick={onClose}>
      <div className="dp-snap-modal" onClick={e => e.stopPropagation()}>
        <div className="dp-snap-header" style={{ borderColor: cfg.color }}>
          <div className="dp-snap-title-row">
            <SeverityBadge severity={event.severity} />
            <h3 className="dp-snap-title">Behavior Detection</h3>
          </div>
          <button className="dp-snap-close" onClick={onClose}>✕</button>
        </div>
        <div className="dp-snap-body">
          {event.frame_jpg_b64 ? (
            <img className="dp-snap-img" src={`data:image/jpeg;base64,${event.frame_jpg_b64}`} alt="Detection snapshot" />
          ) : (
            <div className="dp-snap-noframe">
              <span style={{ fontSize: 48 }}>🎞</span>
              <span>No snapshot available</span>
            </div>
          )}
        </div>
        <div className="dp-snap-footer">
          <div className="dp-snap-detail">
            <span className="dp-snap-label">Camera</span>
            <span className="dp-snap-value">{event.camera_name ?? `ID ${event.camera_id}`}</span>
          </div>
          <div className="dp-snap-detail">
            <span className="dp-snap-label">Confidence</span>
            <span className="dp-snap-value" style={{ color: cfg.color }}>
              {event.confidence != null ? `${Math.round(event.confidence * 100)}%` : "—"}
            </span>
          </div>
          {(event.camera_location || event.camera_zone) && (
            <div className="dp-snap-detail">
              <span className="dp-snap-label">Location / Zone</span>
              <span className="dp-snap-value">
                {event.camera_location || "Unknown"} — {event.camera_zone || "Unknown"}
              </span>
            </div>
          )}
          <div className="dp-snap-detail">
            <span className="dp-snap-label">Time</span>
            <span className="dp-snap-value">{formatTime(event.timestamp)}</span>
          </div>
          <div className="dp-snap-detail">
            <span className="dp-snap-label">Alert ID</span>
            <span className="dp-snap-value">{event.alert_id ?? "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedRow({ event, index, onViewSnapshot, onDelete, onEscalate }) {
  const { user } = useAuth();
  const isStaff = user?.role === "STAFF";
  const cfg = SEVERITY_CONFIG[event.severity] ?? SEVERITY_CONFIG.HIGH;
  const isNew = index === 0;

  return (
    <div className={`dp-row${isNew ? " dp-row--new" : ""}`} style={{ "--sev-color": cfg.color }}>
      <div className="dp-row-indicator" style={{ background: cfg.color }} />
      <div className="dp-row-main">
        <div className="dp-row-top">
          <SeverityBadge severity={event.severity} />
          <span className="dp-row-behavior">{event.behavior_type ?? "—"}</span>
          {event.status && (
            <span className={`dp-status-badge dp-status-${event.status.toLowerCase()}`}>
              {event.status.replace("_", " ")}
            </span>
          )}
          {isNew && <span className="dp-row-live-badge">● LIVE</span>}
        </div>
        <div className="dp-row-bottom">
          <span className="dp-row-camera">📷 {event.camera_name ?? `Camera ${event.camera_id}`}</span>
          {(event.camera_location || event.camera_zone) && (
            <span className="dp-row-camera">
              📍 {event.camera_location || "Unknown"} ({event.camera_zone || "Unknown"})
            </span>
          )}
          <span className="dp-row-conf">
            {event.confidence != null ? `${Math.round(event.confidence * 100)}% confidence` : ""}
          </span>
          <span className="dp-row-time">{formatTime(event.timestamp)}</span>
        </div>
      </div>
      <div className="dp-row-actions">
        {!isStaff && event.alert_id && event.status === "NEW" && (
          <button className="dp-row-action-btn dp-row-action-btn--check" onClick={(e) => { e.stopPropagation(); onEscalate && onEscalate(event); }} title="Confirm Alert">✓</button>
        )}
        <button className="dp-row-snap-btn" onClick={() => onViewSnapshot(event)} title="View snapshot">
          {event.frame_jpg_b64 ? (
            <img className="dp-row-thumb" src={`data:image/jpeg;base64,${event.frame_jpg_b64}`} alt="snapshot" />
          ) : (
            <span className="dp-row-no-thumb">🎞</span>
          )}
        </button>
        {!isStaff && event.alert_id && onDelete && (
          <button className="dp-row-action-btn dp-row-action-btn--cross" onClick={(e) => { e.stopPropagation(); onDelete(event); }} title="False Positive - Delete Alert and Clip">✕</button>
        )}
      </div>
    </div>
  );
}

export default function OpsAlertsPage() {
  useDocumentTitle("Alerts & Events");
  const { token } = useAuth();
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth <= 768);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [paused, setPaused] = useState(() => sessionStorage.getItem("sg_alerts_paused") === "true");
  useEffect(() => { sessionStorage.setItem("sg_alerts_paused", paused); }, [paused]);
  const [historicalFeed, setHistoricalFeed] = useState([]);

  const loadCameras = useCallback(async () => {
    if (!token) return;
    try {
      const cams = await getCameras(token);
      setCameras(Array.isArray(cams) ? cams : (Array.isArray(cams?.results) ? cams.results : []));
    } catch (e) {
      console.error("Failed to load cameras", e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadCameras(); }, [loadCameras]);

  const loadExistingAlerts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch((import.meta.env.VITE_API_BASE_URL || "http://localhost:8000") + "/api/alerts/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const alerts = Array.isArray(data) ? data : (data.results ?? []);
      const shaped = alerts.slice(0, 50).map(a => ({
        camera_id:       a.camera,
        camera_name:     a.camera_name ?? `Camera ${a.camera}`,
        camera_location: a.camera_location ?? null,
        camera_zone:     a.camera_zone ?? null,
        behavior_type:   a.behavior_type,
        confidence:      a.confidence,
        severity:        a.severity,
        alert_id:        a.id,
        timestamp:       a.created_at,
        status:          a.status,
        frame_jpg_b64:   a.frame_jpg_b64 ?? null,
        receivedAt:      new Date(a.created_at).getTime(),
      }));
      setHistoricalFeed(shaped);
    } catch (e) {
      console.error("Failed to load existing alerts", e);
    }
  }, [token]);

  useEffect(() => { loadExistingAlerts(); }, [loadExistingAlerts]);

  const { feed, connectedIds, removeFeedItem } = useAllDetections(paused ? [] : cameras, token);

  const deleteAlert = useCallback(async (event) => {
    if (!event.alert_id) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/api/alerts/${event.alert_id}/`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (res.status === 204 || res.ok) {
        setHistoricalFeed(prev => prev.filter(h => h.alert_id !== event.alert_id));
        removeFeedItem(event.alert_id);
      } else {
        const errText = await res.text().catch(() => "");
        console.error("Failed to delete alert", res.status, errText);
      }
    } catch (e) {
      console.error("Failed to delete alert", e);
    }
  }, [token, removeFeedItem]);

  const escalateAlert = useCallback(async (event) => {
    if (!event.alert_id) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/api/alerts/${event.alert_id}/`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "ESCALATED" }),
      });
      if (res.ok) {
        const updated = await res.json();
        setHistoricalFeed(prev => prev.map(h => h.alert_id === event.alert_id ? { ...h, status: updated.status } : h));
      }
    } catch (e) {
      console.error("Failed to escalate alert", e);
    }
  }, [token]);

  const mergedFeed = [
    ...feed,
    ...historicalFeed.filter(h => !feed.some(f => f.alert_id && f.alert_id === h.alert_id)),
  ];

  const filteredFeed = severityFilter === "ALL"
    ? mergedFeed
    : mergedFeed.filter(e => e.severity === severityFilter);

  const critCount = mergedFeed.filter(e => e.severity === "CRITICAL").length;
  const highCount = mergedFeed.filter(e => e.severity === "HIGH").length;
  const connCount = connectedIds.size;

  return (
    <OpsLayout
      active="alerts"
      title="Alerts & Events"
      subtitle="Real-time AI behavior detection feed"
      sidebarCollapsed={sidebarCollapsed}
      onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
      topbarRight={
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className={`dp-ws-status ${connCount > 0 ? "dp-ws-status--on" : "dp-ws-status--off"}`}>
            <span className="dp-ws-dot" />
            {connCount > 0 ? `${connCount} camera${connCount !== 1 ? "s" : ""} live` : "Disconnected"}
          </div>
          <NotificationBell />
        </div>
      }
    >
      <div className="dp-page-header">
        <div className="dp-kpi-strip">
          <div className="dp-kpi">
            <span className="dp-kpi-val">{mergedFeed.length}</span>
            <span className="dp-kpi-label">Total</span>
          </div>
          <div className="dp-kpi dp-kpi--critical">
            <span className="dp-kpi-val">{critCount}</span>
            <span className="dp-kpi-label">Critical</span>
          </div>
          <div className="dp-kpi dp-kpi--high">
            <span className="dp-kpi-val">{highCount}</span>
            <span className="dp-kpi-label">High</span>
          </div>
        </div>
      </div>

      <section className="sg-card dp-feed-card">
        <div className="dp-toolbar">
          <div className="dp-filters">
            {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map(sev => (
              <button key={sev}
                className={`dp-filter-btn${severityFilter === sev ? " dp-filter-btn--active" : ""}`}
                onClick={() => setSeverityFilter(sev)} data-sev={sev.toLowerCase()}>
                {sev}
              </button>
            ))}
          </div>
          <div className="dp-toolbar-right">
            <button className={`dp-pause-btn${paused ? " dp-pause-btn--paused" : ""}`}
              onClick={() => setPaused(p => !p)}>
              {paused ? "▶ Resume" : "⏸ Pause"}
            </button>
            {mergedFeed.length > 0 && (
              <span className="dp-feed-count">{filteredFeed.length} event{filteredFeed.length !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>

        <div className="dp-feed">
          {loading ? (
            <div className="sg-loading"><div className="sg-spinner" /> Connecting to cameras...</div>
          ) : cameras.length === 0 ? (
            <div className="dp-empty">
              <span style={{ fontSize: 40 }}>📷</span>
              <span>No cameras configured.</span>
              <Link to="/ops/cameras" className="dp-empty-link">Go to Camera Management →</Link>
            </div>
          ) : filteredFeed.length === 0 ? (
            <div className="dp-empty">
              <span style={{ fontSize: 40 }}>✦</span>
              <span className="dp-empty-title">
                {paused ? "Feed paused" : "Monitoring — no detections yet"}
              </span>
              <span className="dp-empty-sub">
                {paused
                  ? "Press Resume to continue receiving live events."
                  : `Watching ${connCount} camera${connCount !== 1 ? "s" : ""}. Events will appear here in real time.`}
              </span>
            </div>
          ) : (
            <div className="dp-feed-list">
              {filteredFeed.map((event, i) => (
                <FeedRow key={`${event.camera_id}-${event.timestamp}-${i}`}
                  event={event} index={i} onViewSnapshot={setSelectedEvent} onDelete={deleteAlert} onEscalate={escalateAlert} />
              ))}
            </div>
          )}
        </div>
      </section>

      {selectedEvent && (
        <SnapshotModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </OpsLayout>
  );
}
