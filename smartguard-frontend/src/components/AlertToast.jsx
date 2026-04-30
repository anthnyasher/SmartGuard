// src/components/AlertToast.jsx
//
// Displays stacked toast notifications for shoplifting detections.
// Drop into any page that receives detection events.
//
// Usage:
//   <AlertToast detections={feed} />
//
// detections — the `feed` array from useAllDetections (newest first)

import { useState, useEffect, useRef } from "react";
import "./AlertToast.css";

const SEVERITY_ICONS = {
  CRITICAL: "🔴",
  HIGH:     "🟠",
  MEDIUM:   "🟡",
  LOW:      "🔵",
};

const AUTO_DISMISS_MS = 7000;
const MAX_VISIBLE     = 3;

export default function AlertToast({ detections }) {
  // Track which detection IDs have been dismissed or shown
  const [toasts,    setToasts]    = useState([]);
  const seenRef                   = useRef(new Set());

  useEffect(() => {
    if (!detections?.length) return;
    const latest = detections[0]; // newest first
    const key = `${latest.camera_id}-${latest.timestamp ?? latest.receivedAt}`;
    if (seenRef.current.has(key)) return;
    seenRef.current.add(key);

    const id = Date.now();
    setToasts(prev => [{ ...latest, _id: id }, ...prev].slice(0, MAX_VISIBLE));

    // Auto-dismiss
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t._id !== id));
    }, AUTO_DISMISS_MS);
  }, [detections]);

  const dismiss = (id) => setToasts(prev => prev.filter(t => t._id !== id));

  if (!toasts.length) return null;

  return (
    <div className="at-stack" role="alert" aria-live="assertive">
      {toasts.map(t => (
        <div key={t._id} className={`at-toast at-toast--${(t.severity || "HIGH").toLowerCase()}`}>
          <div className="at-icon">
            {SEVERITY_ICONS[t.severity] ?? "⚠️"}
          </div>
          <div className="at-body">
            <div className="at-title">
              Heads up!
              <span className={`at-severity at-severity--${(t.severity || "HIGH").toLowerCase()}`}>
                {t.severity}
              </span>
            </div>
            <div className="at-meta">
              <span className="at-cam">📷 {t.camera_name ?? `Camera ${t.camera_id}`}</span>
              <span className="at-conf">{t.confidence != null ? `${Math.round(t.confidence * 100)}% confidence` : ""}</span>
            </div>
          </div>
          <button className="at-close" onClick={() => dismiss(t._id)} aria-label="Dismiss">✕</button>
          <div className="at-progress">
            <div className="at-progress-bar" style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
