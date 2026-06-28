import React, { useState, useEffect } from "react";

const OVERLAY_STYLE = {
  position: "fixed",
  inset: 0,
  background: "rgba(8, 14, 28, 0.72)",
  backdropFilter: "blur(5px)",
  zIndex: 9999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const MODAL_STYLE = {
  background: "var(--bg-surface, #ffffff)",
  border: "1px solid var(--border, #e5e7eb)",
  borderRadius: 12,
  width: "100%",
  maxWidth: 480,
  boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  animation: "mam-up 0.2s ease-out",
};

const HEADER_STYLE = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  padding: "18px 20px 14px",
  borderBottom: "1px solid var(--border, #e5e7eb)",
  gap: 12,
};

const ICON_STYLE = {
  width: 38, height: 38,
  borderRadius: 10,
  background: "linear-gradient(135deg, #1d4ed8, #2563eb)",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 18,
  flexShrink: 0,
  boxShadow: "0 2px 10px rgba(37, 99, 235, 0.3)",
  color: "white",
};

const CLOSE_STYLE = {
  width: 28, height: 28,
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 13,
  border: "1px solid var(--border, #e5e7eb)",
  borderRadius: 6,
  background: "var(--bg-base, #f9fafb)",
  color: "var(--text-muted, #6b7280)",
  cursor: "pointer",
  flexShrink: 0,
};

const LABEL_STYLE = {
  fontSize: "11.5px",
  fontWeight: 600,
  color: "var(--text-secondary, #4b5563)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 6,
  display: "block",
};

const INPUT_STYLE = {
  width: "100%",
  padding: "10px 12px",
  fontSize: "13.5px",
  color: "var(--text-primary, #111827)",
  background: "var(--bg-base, #f9fafb)",
  border: "1px solid var(--border, #e5e7eb)",
  borderRadius: 6,
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const FOOTER_STYLE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 10,
  padding: "16px 20px",
  background: "var(--bg-base, #f9fafb)",
  borderTop: "1px solid var(--border, #e5e7eb)",
};

const BTN_BASE = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 36,
  padding: "0 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 6,
  cursor: "pointer",
  border: "none",
};

export default function ManualAlertModal({ isOpen, onClose, onSubmit, cameraId }) {
  const [behaviorType, setBehaviorType] = useState("Suspicious - Manual");
  const [duration, setDuration] = useState(10);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form whenever the modal opens (new cameraId)
  useEffect(() => {
    if (isOpen) {
      setBehaviorType("Suspicious - Manual");
      setDuration(10);
      setNotes("");
      setIsSubmitting(false);
    }
  }, [isOpen, cameraId]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit(cameraId, behaviorType, notes, duration);
    } catch (err) {
      // error handled by parent
    }
    setIsSubmitting(false);
    setBehaviorType("Suspicious - Manual");
    setDuration(10);
    setNotes("");
    onClose();
  };

  return (
    <div style={OVERLAY_STYLE} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={MODAL_STYLE}>
        {/* Header */}
        <div style={HEADER_STYLE}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={ICON_STYLE}>🚨</div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary, #111827)", margin: 0, letterSpacing: "-0.015em" }}>
                Trigger Manual Alert
              </h2>
              <p style={{ fontSize: 12, color: "var(--text-muted, #6b7280)", margin: "2px 0 0" }}>
                Manually mark an incident on Camera {cameraId} and start evidence recording.
              </p>
            </div>
          </div>
          <button style={CLOSE_STYLE} onClick={onClose} title="Close">✕</button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} id="manualAlertForm" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={LABEL_STYLE}>Behavior Type</label>
            <select
              value={behaviorType}
              onChange={(e) => setBehaviorType(e.target.value)}
              style={INPUT_STYLE}
            >
              <option value="Suspicious - Manual">Suspicious</option>
              <option value="Shoplifting - Manual">Shoplifting</option>
              <option value="Loitering - Manual">Loitering</option>
              <option value="Vandalism - Manual">Vandalism</option>
              <option value="Other - Manual">Other</option>
            </select>
          </div>

          <div>
            <label style={LABEL_STYLE}>Clip Duration (Pre-roll)</label>
            <select
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value))}
              style={INPUT_STYLE}
            >
              <option value={10}>10 seconds (Standard)</option>
              <option value={15}>15 seconds</option>
              <option value={20}>20 seconds</option>
              <option value={30}>30 seconds (Max)</option>
            </select>
          </div>

          <div>
            <label style={LABEL_STYLE}>Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ ...INPUT_STYLE, resize: "vertical", minHeight: 80 }}
              placeholder="What did you observe?"
            />
          </div>
        </form>

        {/* Footer Actions */}
        <div style={FOOTER_STYLE}>
          <button
            type="button"
            onClick={onClose}
            style={{ ...BTN_BASE, background: "var(--bg-surface, #fff)", border: "1px solid var(--border, #e5e7eb)", color: "var(--text-secondary, #4b5563)" }}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="manualAlertForm"
            style={{ ...BTN_BASE, background: "var(--accent-blue, #2563eb)", color: "#fff", boxShadow: "0 2px 4px rgba(37,99,235,0.2)", opacity: isSubmitting ? 0.6 : 1 }}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Triggering..." : "Trigger Alert & Record"}
          </button>
        </div>
      </div>
    </div>
  );
}
