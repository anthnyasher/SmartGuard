// src/components/CameraFormModal.jsx
// Shared Add / Edit camera form.
// Used in both LiveMonitoring (via Configure Cameras modal) and CameraManagement page.
//
// Props:
//   mode         "add" | "edit"
//   camera       camera object to pre-fill (required when mode === "edit")
//   onSave(data) called with cleaned form data on submit
//   onClose()    called on cancel or backdrop click
//   saving       bool — disables submit while API call is in flight
//   error        string | null — server-side error to display

import { useState, useEffect } from "react";
import "./CameraFormModal.css";

const EMPTY = {
    name: "",
    rtsp_url: "",
    stream_mjpeg_url: "",
    location: "",
    zone: "",
    is_active: true,
};

export default function CameraFormModal({
    mode = "add",
    camera = null,
    onSave,
    onClose,
    saving = false,
    error = null,
}) {
    const [form, setForm] = useState(EMPTY);

    // Pre-fill when editing
    useEffect(() => {
        if (mode === "edit" && camera) {
            setForm({
                name: camera.name ?? "",
                rtsp_url: camera.rtsp_url ?? "",
                stream_mjpeg_url: camera.stream_mjpeg_url ?? "",  // display only
                location: camera.location ?? "",
                zone: camera.zone ?? "",
                is_active: camera.is_active ?? true,
            });

        } else {
            setForm(EMPTY);
        }
    }, [mode, camera]);

    // Close on Escape
    useEffect(() => {
        const h = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const set = (field) => (e) => {
        const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
        setForm(f => ({ ...f, [field]: val }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            name: form.name.trim(),
            rtsp_url: form.rtsp_url.trim(),
            // DO NOT send stream_mjpeg_url; backend computes it
            location: form.location.trim(),
            zone: form.zone.trim(),
            is_active: form.is_active,
        });
    };


    const isEdit = mode === "edit";

    return (
        <div className="cfm-overlay" onClick={onClose}>
            <div className="cfm-modal" onClick={e => e.stopPropagation()}>

                {/* ── Header ── */}
                <div className="cfm-header">
                    <div className="cfm-header-left">
                        <div className="cfm-header-icon">📷</div>
                        <div>
                            <h2 className="cfm-title">{isEdit ? "Edit Camera" : "Add New Camera"}</h2>
                            <p className="cfm-subtitle">
                                {isEdit ? `Editing: ${camera?.name}` : "Configure a new camera for SmartGuard monitoring"}
                            </p>
                        </div>
                    </div>
                    <button className="cfm-close" onClick={onClose} title="Close (Esc)">✕</button>
                </div>

                {/* ── Error banner ── */}
                {error && (
                    <div className="cfm-error">
                        <span className="cfm-error-icon">⚠</span>
                        {error}
                    </div>
                )}

                {/* ── Form body ── */}
                <form className="cfm-body" onSubmit={handleSubmit} autoComplete="off">

                    {/* Camera name + active toggle */}
                    <div className="cfm-row">
                        <div className="cfm-field" style={{ flex: 1 }}>
                            <label className="cfm-label">
                                Camera Name <span className="cfm-required">*</span>
                            </label>
                            <input
                                className="cfm-input"
                                type="text"
                                placeholder="e.g. Entrance CAM-01"
                                value={form.name}
                                onChange={set("name")}
                                required
                                autoFocus
                            />
                        </div>
                        <div className="cfm-field cfm-field--toggle">
                            <label className="cfm-label">Active</label>
                            <label className="cfm-toggle">
                                <input
                                    type="checkbox"
                                    checked={form.is_active}
                                    onChange={set("is_active")}
                                />
                                <span className="cfm-toggle-slider" />
                                <span className="cfm-toggle-text">
                                    {form.is_active ? "Enabled" : "Disabled"}
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* RTSP URL */}
                    <div className="cfm-field">
                        <label className="cfm-label">
                            RTSP Stream URL <span className="cfm-required">*</span>
                            <span className="cfm-label-hint"> — used by the YOLOv5 detection engine</span>
                        </label>
                        <input
                            className="cfm-input cfm-input--mono"
                            type="text"
                            placeholder="rtsp://username:password@192.168.1.100:554/stream1"
                            value={form.rtsp_url}
                            onChange={set("rtsp_url")}
                            required
                        />
                    </div>

                    {/* MJPEG URL */}
                    <div className="cfm-field">
                        <label className="cfm-label">
                            MJPEG Proxy URL
                            <span className="cfm-label-hint"> — browser-viewable live feed (optional)</span>
                        </label>
                        <input
                            className="cfm-input cfm-input--mono"
                            type="text"
                            placeholder="http://192.168.1.100:8080/video"
                            value={form.stream_mjpeg_url}
                            onChange={set("stream_mjpeg_url")}
                        />
                        <p className="cfm-note">
                            💡 Browsers cannot display RTSP directly. Add an MJPEG proxy URL to show a live feed in Live Monitoring.
                            Leave blank if no browser stream is available.
                        </p>
                    </div>

                    {/* Location + Zone */}
                    <div className="cfm-row">
                        <div className="cfm-field" style={{ flex: 1 }}>
                            <label className="cfm-label">Location</label>
                            <input
                                className="cfm-input"
                                type="text"
                                placeholder="e.g. Main Entrance"
                                value={form.location}
                                onChange={set("location")}
                            />
                        </div>
                        <div className="cfm-field" style={{ flex: 1 }}>
                            <label className="cfm-label">Zone</label>
                            <input
                                className="cfm-input"
                                type="text"
                                placeholder="e.g. Zone A"
                                value={form.zone}
                                onChange={set("zone")}
                            />
                        </div>
                    </div>

                    {/* ── Footer ── */}
                    <div className="cfm-footer">
                        <button
                            type="button"
                            className="cfm-btn-cancel"
                            onClick={onClose}
                            disabled={saving}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="cfm-btn-save"
                            disabled={saving}
                        >
                            {saving
                                ? <><span className="cfm-spinner" /> Saving...</>
                                : isEdit ? "Save Changes" : "Add Camera"
                            }
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}