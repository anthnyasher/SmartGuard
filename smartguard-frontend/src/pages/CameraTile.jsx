// src/pages/CameraTile.jsx
import { useEffect, useRef, useState } from "react";
import AuthenticatedStream from "../components/AuthenticatedStream.jsx";
import { useDetectionSocket } from "../hooks/useDetectionSocket.js";

const OVERLAY_DURATION_MS = 5000;

const SEVERITY_COLORS = {
  CRITICAL: "#ef4444",
  HIGH:     "#f97316",
  MEDIUM:   "#eab308",
  LOW:      "#3b82f6",
};

function CameraTile({ cam, token, onSelect, paused, onDetection }) {
  const isOnline  = cam.status === "ONLINE" || cam.status === "online";
  const hasStream = !!(cam.stream_mjpeg_url);

  const { detection } = useDetectionSocket(cam.id, token);

  // Active overlay state — auto-clears after OVERLAY_DURATION_MS
  const [activeAlert, setActiveAlert] = useState(null);
  const clearTimerRef = useRef(null);

  useEffect(() => {
    if (!detection) return;

    // Bubble up to LiveMonitoring for the toast
    if (onDetection) onDetection({ ...detection, camera_name: cam.name });

    setActiveAlert(detection);
    clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => setActiveAlert(null), OVERLAY_DURATION_MS);
  }, [detection]);

  useEffect(() => () => clearTimeout(clearTimerRef.current), []);

  const alertColor = activeAlert
    ? (SEVERITY_COLORS[activeAlert.severity] ?? SEVERITY_COLORS.HIGH)
    : null;

  return (
    <div
      className={`lm-tile ${isOnline ? "lm-tile--online" : "lm-tile--offline"}${activeAlert ? " lm-tile--alert" : ""}`}
      onClick={() => onSelect?.(cam)}
      style={activeAlert ? { "--alert-color": alertColor } : undefined}
    >
      {/* Header */}
      <div className="lm-tile-header">
        <div className="lm-tile-name-row">
          <span className={`lm-status-dot ${isOnline ? "dot-online" : "dot-offline"}`} />
          <span className="lm-tile-name">{cam.name}</span>
        </div>
        <span className={`lm-status-chip ${isOnline ? "chip-online" : "chip-offline"}`}>
          {cam.status || "UNKNOWN"}
        </span>
      </div>

      {/* Video */}
      <div className="lm-tile-video-wrap">
        {hasStream && token && !paused ? (
          <AuthenticatedStream
            streamUrl={cam.stream_mjpeg_url}
            token={token}
            alt={cam.name}
            className="lm-tile-video"
          />
        ) : (
          <div className="lm-tile-offline-screen">
            <svg className="lm-camera-svg" viewBox="0 0 48 48" fill="none">
              <rect x="4" y="12" width="32" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="20" cy="24" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M36 20l8-5v18l-8-5V20z" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span className="lm-tile-offline-label">
              {isOnline ? "No stream configured" : "Camera offline"}
            </span>
          </div>
        )}

        {/* Detection overlay */}
        {activeAlert && (
          <div className="lm-tile-detection-overlay" style={{ "--alert-color": alertColor }}>
            <span className="lm-tile-detection-badge">
              <span className="lm-tile-detection-pulse" />
              ⚠ SHOPLIFTING · {Math.round((activeAlert.confidence ?? 0) * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      {cam.location && (
        <div className="lm-tile-footer">
          <span className="lm-tile-location">📍 {cam.location}</span>
        </div>
      )}
    </div>
  );
}

export default CameraTile;