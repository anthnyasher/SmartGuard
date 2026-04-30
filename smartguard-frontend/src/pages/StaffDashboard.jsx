// src/pages/StaffDashboard.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getAlerts, acknowledgeAlert } from "../api/alertApi.js";
import "./AdminDashboard.css";
import "./StaffPortal.css";

// ─── Alarm confirm modal ───────────────────────────────────────────────────────
function AlarmConfirmModal({ alert, onConfirm, onCancel }) {
  const camName = alert.camera?.name || alert.camera_name || alert.camera || "N/A";
  return (
    <div className="staff-overlay" onClick={onCancel}>
      <div className="staff-alarm-modal" onClick={e => e.stopPropagation()}>
        <div className="staff-alarm-icon">🚨</div>
        <h3 className="staff-alarm-title">Trigger Store Alarm?</h3>
        <p className="staff-alarm-body">
          This will activate the store Disturbing Alarm for the incident at:
        </p>
        <div className="staff-alarm-camera">📍 {camName}</div>
        <p className="staff-alarm-sub">
          All nearby staff will be alerted. Only use when an incident is confirmed.
        </p>
        <div className="staff-alarm-actions">
          
          <button className="staff-alarm-btn staff-alarm-btn--cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
function StaffDashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [alerts, setAlerts]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [alarmModal, setAlarmModal] = useState(null);
  const [filter, setFilter]         = useState("ACTIVE");

  // ── Fetch alerts — your original logic, variable renamed to avoid TDZ crash ──
  // BUG FIX: renamed `data` → `responseData` to prevent "Cannot access 'data'
  // before initialization" ReferenceError caused by duplicate const declarations
  useEffect(() => {
    async function fetchAlerts() {
      try {
        const responseData = await getAlerts(token);           // ← was `data`

        const filtered = Array.isArray(responseData)
          ? responseData.filter(
              (a) => a.status === "ACTIVE" || a.status === "NEW"
            )
          : [];

        setAlerts(filtered);
      } catch (err) {
        console.error("Failed to fetch alerts for Staff:", err);
        setAlerts([]);
      } finally {
        setLoading(false);
      }
    }

    if (token && user) {
      fetchAlerts();
    }
  }, [token, user]);

  // ── Acknowledge — your original logic preserved exactly ─────────────────────
  const handleAcknowledge = async (alertId) => {
    try {
      await acknowledgeAlert(token, alertId);
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId ? { ...a, acknowledged: true } : a
        )
      );
    } catch (err) {
      console.error("Failed to acknowledge alert", err);
      alert("Failed to acknowledge alert");
    }
  };

  // ── Trigger alarm ────────────────────────────────────────────────────────────
  const confirmAlarm = () => {
    // TODO: POST /api/alerts/<id>/trigger-alarm/
    setAlerts(prev =>
      prev.map(a => a.id === alarmModal.id ? { ...a, alarmTriggered: true } : a)
    );
    setAlarmModal(null);
  };

  const handleLogout = () => { logout(); navigate("/login", { replace: true }); };

  // ── Derived state ────────────────────────────────────────────────────────────
  const activeAlerts = alerts.filter(a => !a.acknowledged);
  const ackedAlerts  = alerts.filter(a => a.acknowledged);
  const displayed    =
    filter === "ALL"          ? alerts :
    filter === "ACKNOWLEDGED" ? ackedAlerts :
                                activeAlerts;

  return (
    <div className="staff-portal">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="staff-header">
        <div className="staff-header-left">
          <div className="staff-logo">
            <span className="staff-logo-icon">🛡</span>
            <span className="staff-logo-text">
              <span className="staff-logo-smart">SMART</span>
              <span className="staff-logo-guard">GUARD</span>
            </span>
            <span className="staff-role-chip">Staff Portal</span>
          </div>
        </div>

        <div className="staff-header-right">
          {activeAlerts.length > 0 && (
            <div className="staff-alert-banner">
              <span className="staff-bell">🔔</span>
              <span>
                <strong>{activeAlerts.length} active alert{activeAlerts.length !== 1 ? "s" : ""}</strong> assigned to you
              </span>
            </div>
          )}
          <div className="staff-user-chip">
            <div className="staff-user-avatar">
              {user?.email?.[0]?.toUpperCase() || "S"}
            </div>
            <div>
              <div className="staff-user-name">{user?.email?.split("@")[0]}</div>
              <div className="staff-user-role">Store Staff</div>
            </div>
          </div>
          <button className="staff-logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="staff-main">

        {/* Status row */}
        <div className="staff-status-row">
          <div>
            <h1 className="staff-page-title">My Alerts</h1>
            <p className="staff-page-sub">
              Alerts assigned to you. Acknowledge receipt and trigger the alarm when needed.
            </p>
          </div>
          <div className="staff-kpi-row">
            <div className="staff-kpi staff-kpi--red">
              <div className="staff-kpi-val">{activeAlerts.length}</div>
              <div className="staff-kpi-label">Active</div>
            </div>
            <div className="staff-kpi staff-kpi--green">
              <div className="staff-kpi-val">{ackedAlerts.length}</div>
              <div className="staff-kpi-label">Acknowledged</div>
            </div>
    
          </div>
        </div>

        {/* Filter tabs */}
        <div className="staff-filter-row">
          {[
            { key: "ACTIVE",       label: `Active (${activeAlerts.length})`      },
            { key: "ACKNOWLEDGED", label: `Acknowledged (${ackedAlerts.length})` },
            { key: "ALL",          label: `All (${alerts.length})`               },
          ].map(f => (
            <button
              key={f.key}
              className={`staff-filter-btn${filter === f.key ? " staff-filter-btn--active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Alert list */}
        {loading ? (
          <div className="staff-empty">
            <span style={{ fontSize: 32 }}>⏳</span>
            <p className="staff-empty-title">Loading your alerts...</p>
          </div>
        ) : displayed.length === 0 ? (
          <div className="staff-empty">
            <span style={{ fontSize: 52 }}>✦</span>
            <p className="staff-empty-title">
              No {filter === "ACTIVE" ? "active " : ""}alerts assigned to you
            </p>
            <p className="staff-empty-sub">
              You will be notified here when an incident is assigned.
            </p>
          </div>
        ) : (
          <div className="staff-alert-list">
            {displayed.map(alert => {
              // Per spec: staff sees camera location and time ONLY
              // behavior_type and severity intentionally NOT shown
              const camName  = alert.camera?.name || alert.camera_name || alert.camera || "N/A";
              const timeStr  = new Date(alert.created_at).toLocaleString();
              const isActive = !alert.acknowledged;

              return (
                <div
                  key={alert.id}
                  className={`staff-alert-card${isActive ? " staff-alert-card--active" : ""}`}
                >
                  <div className={`staff-alert-pulse${isActive ? " staff-alert-pulse--live" : ""}`} />

                  <div className="staff-alert-body">
                    <div className="staff-alert-top">
                      {isActive && <span className="staff-live-badge">● ACTIVE</span>}
                      {alert.alarmTriggered && (
                        <span className="staff-alarm-triggered-badge">🚨 ALARM TRIGGERED</span>
                      )}
                      <span className="staff-alert-id">{alert.id}</span>
                    </div>

                    {/* Camera name — primary info per spec */}
                    <div className="staff-alert-location">
                      <span>📍</span>
                      <span className="staff-location-name">{camName}</span>
                    </div>

                    {/* Time — only other info staff should see per spec */}
                    <div className="staff-alert-time">
                      <span>🕐</span>
                      <span>{timeStr}</span>
                    </div>
                  </div>

                  <div className="staff-alert-actions">
                    {/* Acknowledge — your original handleAcknowledge */}
                    <button
                      className="staff-btn staff-btn--ack"
                      onClick={() => handleAcknowledge(alert.id)}
                      disabled={alert.acknowledged}
                    >
                      {alert.acknowledged ? "✓ Acknowledged" : "✓ Acknowledge"}
                    </button>

                    {/* Trigger alarm — per spec */}
                    <button
                      className="staff-btn staff-btn--alarm"
                      onClick={() => setAlarmModal(alert)}
                      disabled={alert.alarmTriggered}
                    >
                      {alert.alarmTriggered ? "🚨 Alarm Sent" : "🚨 Trigger Alarm"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Access restriction notice */}
        <div className="staff-access-notice">
          <span>🔒</span>
          <span>
            Camera feeds, video clips, and system settings are only accessible
            to Operations Managers and Administrators.
          </span>
        </div>

      </main>

      {/* Alarm confirm modal */}
      {alarmModal && (
        <AlarmConfirmModal
          alert={alarmModal}
          onConfirm={confirmAlarm}
          onCancel={() => setAlarmModal(null)}
        />
      )}
    </div>
  );
}

export default StaffDashboard;