// src/pages/SettingsPage.jsx
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getSettings, updateSettings } from "../api/settingsApi.js";
import "./AdminDashboard.css";
import "./shared-components.css";
import "./SettingsPage.css";

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

const TABS = [
  { id: "general",       label: "General",          icon: "⚙"  },
  { id: "notifications", label: "Notifications",    icon: "🔔" },
  { id: "ai",            label: "AI Detection",     icon: "✦"  },
  { id: "security",      label: "Security",         icon: "🛡"  },
  { id: "backup",        label: "Backup & Restore", icon: "💾" },
];

// TODO: Load real settings from GET /api/settings/
// Defaults set per thesis specification (30 day retention, etc.)
const DEFAULT_SETTINGS = {
  general: {
    systemName:     "SmartGuard AI",
    storeName:      "FairPrice Supermarket",
    timezone:       "Asia/Manila",
    dateFormat:     "YYYY-MM-DD",
    sessionTimeout: 30,
  },
  notifications: {
    emailAlerts:   true,
    smsAlerts:     false,
    alertEmail:    "admin@fairprice.com",
    alertPhone:    "",
    notifyOn:      { CRITICAL: true, HIGH: true, MEDIUM: false, LOW: false },
  },
  ai: {
    model:                "YOLOv5s",
    frameRate:            15,
    confidenceThreshold:  65,
    loiteringDuration:    60,          // seconds before loitering alert
    concealmentZones:     ["Zone GF — Aisle 1", "Zone GF — Aisle 2"],
    behaviors: {
      SHOPLIFTING:  true,
      CONCEALMENT:  true,
      LOITERING:    true,
      RUNNING:      false,
      FIGHTING:     false,
    },
    autoCreateEvidence: true,
  },
  security: {
    maxFailedLogins:  5,
    lockoutDuration:  2,    // minutes
    sessionTimeout:   30,   // minutes
    requireStrongPassword: true,
    logRetentionDays: 30,   // 30 day default per RA 10173 / NPC Circular 2024-02
  },
  backup: {
    autoBackup:      true,
    frequency:       "daily",
    backupTime:      "02:00",
    retentionDays:   30,
  },
};

// TODO: Replace with GET /api/backup/history/
const BACKUP_HISTORY = [
  { id: 1, date: "2026-02-27",  time: "02:00 AM", size: "248 MB", status: "Success", type: "Scheduled" },
  { id: 2, date: "2026-02-26",  time: "02:00 AM", size: "241 MB", status: "Success", type: "Scheduled" },
  { id: 3, date: "2026-02-25",  time: "02:01 AM", size: "235 MB", status: "Success", type: "Scheduled" },
  { id: 4, date: "2026-02-24",  time: "03:12 PM", size: "230 MB", status: "Success", type: "Manual"    },
];

function Toggle({ value, onChange }) {
  return (
    <button
      className={`set-toggle ${value ? "set-toggle--on" : ""}`}
      onClick={() => onChange(!value)}
      type="button"
    >
      <span className="set-toggle-thumb" />
    </button>
  );
}

export default function SettingsPage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab]   = useState("general");
  const [settings, setSettings]     = useState(DEFAULT_SETTINGS);
  const [saved, setSaved]           = useState(false);
  const [newZone, setNewZone]       = useState("");

  const handleLogout = () => { logout(); navigate("/login", { replace: true }); };

  const update = (section, key, value) =>
    setSettings(p => ({ ...p, [section]: { ...p[section], [key]: value } }));

  // ── Load settings from backend on mount ────────────────────────────────────
  useEffect(() => {
    async function fetchSettings() {
      try {
        const data = await getSettings(token);
        setSettings({
          general: {
            systemName:     data.system_name     || DEFAULT_SETTINGS.general.systemName,
            storeName:      data.store_name      || DEFAULT_SETTINGS.general.storeName,
            timezone:       data.timezone        || DEFAULT_SETTINGS.general.timezone,
            dateFormat:     data.date_format     || DEFAULT_SETTINGS.general.dateFormat,
            sessionTimeout: data.session_timeout_minutes || DEFAULT_SETTINGS.general.sessionTimeout,
          },
          notifications: {
            emailAlerts: data.email_alerts_enabled ?? DEFAULT_SETTINGS.notifications.emailAlerts,
            smsAlerts:   data.sms_alerts_enabled   ?? DEFAULT_SETTINGS.notifications.smsAlerts,
            alertEmail:  data.alert_email          || DEFAULT_SETTINGS.notifications.alertEmail,
            alertPhone:  data.alert_phone          || DEFAULT_SETTINGS.notifications.alertPhone,
            notifyOn: {
              CRITICAL: data.notify_on_critical ?? true,
              HIGH:     data.notify_on_high     ?? true,
              MEDIUM:   data.notify_on_medium   ?? false,
              LOW:      data.notify_on_low      ?? false,
            },
          },
          ai: {
            model:               data.ai_model               || DEFAULT_SETTINGS.ai.model,
            frameRate:           data.frame_rate              || DEFAULT_SETTINGS.ai.frameRate,
            confidenceThreshold: data.confidence_threshold    || DEFAULT_SETTINGS.ai.confidenceThreshold,
            loiteringDuration:   data.loitering_duration      || DEFAULT_SETTINGS.ai.loiteringDuration,
            concealmentZones:    data.concealment_zones       || DEFAULT_SETTINGS.ai.concealmentZones,
            behaviors:           data.enabled_behaviors       || DEFAULT_SETTINGS.ai.behaviors,
            autoCreateEvidence:  data.auto_create_evidence    ?? DEFAULT_SETTINGS.ai.autoCreateEvidence,
          },
          security: {
            maxFailedLogins:       data.max_failed_logins       || DEFAULT_SETTINGS.security.maxFailedLogins,
            lockoutDuration:       data.lockout_duration_minutes || DEFAULT_SETTINGS.security.lockoutDuration,
            sessionTimeout:        data.session_timeout_minutes || DEFAULT_SETTINGS.security.sessionTimeout,
            requireStrongPassword: data.require_strong_password ?? DEFAULT_SETTINGS.security.requireStrongPassword,
            logRetentionDays:      data.log_retention_days      || DEFAULT_SETTINGS.security.logRetentionDays,
          },
          backup: {
            autoBackup:    data.auto_backup          ?? DEFAULT_SETTINGS.backup.autoBackup,
            frequency:     data.backup_frequency     || DEFAULT_SETTINGS.backup.frequency,
            backupTime:    data.backup_time           || DEFAULT_SETTINGS.backup.backupTime,
            retentionDays: data.backup_retention_days || DEFAULT_SETTINGS.backup.retentionDays,
          },
        });
      } catch (err) {
        console.warn("Could not load settings from API, using defaults:", err);
      }
    }
    if (token) fetchSettings();
  }, [token]);

  const handleSave = async () => {
    try {
      // Convert frontend settings to backend field names
      const payload = {
        system_name:              settings.general.systemName,
        store_name:               settings.general.storeName,
        timezone:                 settings.general.timezone,
        date_format:              settings.general.dateFormat,
        session_timeout_minutes:  settings.general.sessionTimeout,
        email_alerts_enabled:     settings.notifications.emailAlerts,
        sms_alerts_enabled:       settings.notifications.smsAlerts,
        alert_email:              settings.notifications.alertEmail,
        alert_phone:              settings.notifications.alertPhone,
        notify_on_critical:       settings.notifications.notifyOn.CRITICAL,
        notify_on_high:           settings.notifications.notifyOn.HIGH,
        notify_on_medium:         settings.notifications.notifyOn.MEDIUM,
        notify_on_low:            settings.notifications.notifyOn.LOW,
        ai_model:                 settings.ai.model,
        frame_rate:               settings.ai.frameRate,
        confidence_threshold:     settings.ai.confidenceThreshold,
        loitering_duration:       settings.ai.loiteringDuration,
        concealment_zones:        settings.ai.concealmentZones,
        enabled_behaviors:        settings.ai.behaviors,
        auto_create_evidence:     settings.ai.autoCreateEvidence,
        max_failed_logins:        settings.security.maxFailedLogins,
        lockout_duration_minutes: settings.security.lockoutDuration,
        require_strong_password:  settings.security.requireStrongPassword,
        log_retention_days:       settings.security.logRetentionDays,
        auto_backup:              settings.backup.autoBackup,
        backup_frequency:         settings.backup.frequency,
        backup_time:              settings.backup.backupTime,
        backup_retention_days:    settings.backup.retentionDays,
      };
      await updateSettings(token, payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("Failed to save settings:", err);
      alert("Failed to save settings. Please try again.");
    }
  };

  const addConcealmentZone = () => {
    if (!newZone.trim()) return;
    update("ai", "concealmentZones", [...settings.ai.concealmentZones, newZone.trim()]);
    setNewZone("");
  };

  const removeConcealmentZone = (zone) =>
    update("ai", "concealmentZones", settings.ai.concealmentZones.filter(z => z !== zone));

  return (
    <div className="sg-layout">
      <aside className={`sg-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sg-sidebar-logo">
          <div className="sg-logo-icon">🛡</div>
          {!sidebarCollapsed && <span className="sg-logo-text"><span className="sg-logo-smart">SMART</span><span className="sg-logo-guard">GUARD</span></span>}
        </div>
        <nav className="sg-sidebar-nav">
          {NAV_ITEMS.map(item => (
            <Link key={item.id} to={item.path} className={`sg-nav-item${item.id === "settings" ? " sg-nav-active" : ""}`}>
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
              <span className="sg-breadcrumb-current">Settings</span>
            </div>
          </div>
          <div className="sg-topbar-right">
            <button className="sg-pdf-btn" onClick={handleSave} style={{ background: "var(--accent-green)", color: "#fff", border: "none" }}>
              ✓ Save Changes
            </button>
            {saved && <span className="set-saved-toast">✓ Saved successfully</span>}
          </div>
        </header>

        <div className="sg-content">
          <h1 className="sg-page-title">Settings</h1>
          <div className="set-layout">

            {/* Tab sidebar */}
            <div className="set-tab-sidebar">
              {TABS.map(t => (
                <button key={t.id} className={`set-tab-btn${activeTab === t.id ? " set-tab-btn--active" : ""}`} onClick={() => setActiveTab(t.id)}>
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {/* Tab body */}
            <div className="sg-card set-tab-body">

              {/* ── GENERAL ── */}
              {activeTab === "general" && (
                <div className="set-section">
                  <h3 className="set-section-title">General Settings</h3>
                  {[
                    { label: "System Name",      key: "systemName",  type: "text"   },
                    { label: "Store Name",        key: "storeName",   type: "text"   },
                    { label: "Timezone",          key: "timezone",    type: "text"   },
                    { label: "Date Format",       key: "dateFormat",  type: "text"   },
                  ].map(f => (
                    <div key={f.key} className="set-field">
                      <label className="set-label">{f.label}</label>
                      <input className="set-input" type={f.type}
                        value={settings.general[f.key]}
                        onChange={e => update("general", f.key, e.target.value)} />
                    </div>
                  ))}
                  <div className="set-field">
                    <label className="set-label">Session Timeout</label>
                    <div className="set-input-row">
                      <input className="set-input set-input--short" type="number" min={5} max={480}
                        value={settings.general.sessionTimeout}
                        onChange={e => update("general", "sessionTimeout", Number(e.target.value))} />
                      <span className="set-unit">minutes — accounts lock after this period of inactivity</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── NOTIFICATIONS ── */}
              {activeTab === "notifications" && (
                <div className="set-section">
                  <h3 className="set-section-title">Notification Settings</h3>
                  <div className="set-toggle-row">
                    <div>
                      <div className="set-label">Email Alerts</div>
                      <div className="set-hint">Send alert notifications by email</div>
                    </div>
                    <Toggle value={settings.notifications.emailAlerts} onChange={v => update("notifications","emailAlerts",v)} />
                  </div>
                  {settings.notifications.emailAlerts && (
                    <div className="set-field">
                      <label className="set-label">Notification Email</label>
                      <input className="set-input" type="email"
                        value={settings.notifications.alertEmail}
                        onChange={e => update("notifications","alertEmail",e.target.value)} />
                    </div>
                  )}
                  <div className="set-toggle-row">
                    <div>
                      <div className="set-label">SMS Alerts</div>
                      <div className="set-hint">Send alert notifications by SMS</div>
                    </div>
                    <Toggle value={settings.notifications.smsAlerts} onChange={v => update("notifications","smsAlerts",v)} />
                  </div>
                  {settings.notifications.smsAlerts && (
                    <div className="set-field">
                      <label className="set-label">Mobile Number</label>
                      <input className="set-input" type="tel"
                        value={settings.notifications.alertPhone}
                        onChange={e => update("notifications","alertPhone",e.target.value)} />
                    </div>
                  )}
                  <div className="set-divider" />
                  <h4 className="set-subsection-title">Notify me for these severity levels</h4>
                  {Object.entries(settings.notifications.notifyOn).map(([sev, on]) => (
                    <div key={sev} className="set-toggle-row">
                      <div>
                        <span className={`sg-chip sg-sev-${sev}`}>{sev}</span>
                      </div>
                      <Toggle value={on} onChange={v => update("notifications","notifyOn",{ ...settings.notifications.notifyOn, [sev]: v })} />
                    </div>
                  ))}
                </div>
              )}

              {/* ── AI DETECTION ── */}
              {activeTab === "ai" && (
                <div className="set-section">
                  <h3 className="set-section-title">AI Detection Settings</h3>

                  <div className="set-field">
                    <label className="set-label">Detection Model</label>
                    <select className="set-input"
                      value={settings.ai.model}
                      onChange={e => update("ai","model",e.target.value)}>
                      <option value="YOLOv5s">YOLOv5s — Faster, lower accuracy (recommended for real-time)</option>
                      <option value="YOLOv5m">YOLOv5m — Balanced speed and accuracy</option>
                      <option value="YOLOv5l">YOLOv5l — Highest accuracy, requires more resources</option>
                    </select>
                  </div>

                  <div className="set-field">
                    <label className="set-label">Detection Confidence Threshold — {settings.ai.confidenceThreshold}%</label>
                    <div className="set-hint" style={{ marginBottom: 8 }}>
                      Detections below this confidence level will be ignored. Higher values reduce false alerts.
                    </div>
                    <input className="set-slider" type="range" min={10} max={99}
                      value={settings.ai.confidenceThreshold}
                      onChange={e => update("ai","confidenceThreshold",Number(e.target.value))} />
                    <div className="set-slider-labels"><span>10% (lenient)</span><span>99% (strict)</span></div>
                  </div>

                  <div className="set-field">
                    <label className="set-label">Camera Frame Rate</label>
                    <div className="set-input-row">
                      <input className="set-input set-input--short" type="number" min={1} max={30}
                        value={settings.ai.frameRate}
                        onChange={e => update("ai","frameRate",Number(e.target.value))} />
                      <span className="set-unit">frames per second analyzed by the AI engine</span>
                    </div>
                  </div>

                  <div className="set-divider" />
                  <h4 className="set-subsection-title">Loitering Detection</h4>
                  <div className="set-field">
                    <label className="set-label">Loitering Duration Threshold</label>
                    <div className="set-hint" style={{ marginBottom: 8 }}>
                      A person must remain in the same area for this many seconds before triggering a loitering alert.
                    </div>
                    <div className="set-input-row">
                      <input className="set-input set-input--short" type="number" min={10} max={600}
                        value={settings.ai.loiteringDuration}
                        onChange={e => update("ai","loiteringDuration",Number(e.target.value))} />
                      <span className="set-unit">seconds</span>
                    </div>
                  </div>

                  <div className="set-divider" />
                  <h4 className="set-subsection-title">Concealment Zones</h4>
                  <div className="set-hint" style={{ marginBottom: 12 }}>
                    Define which store zones are monitored for concealment behavior (e.g. hiding items under clothing).
                  </div>
                  <div className="set-zone-list">
                    {settings.ai.concealmentZones.map(z => (
                      <div key={z} className="set-zone-item">
                        <span>📍 {z}</span>
                        <button className="det-btn det-btn--danger" style={{ padding: "2px 8px", fontSize: 10 }} onClick={() => removeConcealmentZone(z)}>Remove</button>
                      </div>
                    ))}
                    <div className="set-input-row" style={{ marginTop: 8 }}>
                      <input className="set-input" placeholder="e.g. Zone GF — Aisle 3"
                        value={newZone} onChange={e => setNewZone(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && addConcealmentZone()} />
                      <button className="det-btn det-btn--view" onClick={addConcealmentZone}>+ Add Zone</button>
                    </div>
                  </div>

                  <div className="set-divider" />
                  <h4 className="set-subsection-title">Behavior Detection</h4>
                  <div className="set-hint" style={{ marginBottom: 12 }}>
                    Enable or disable detection for specific types of behavior.
                  </div>
                  {Object.entries(settings.ai.behaviors).map(([beh, on]) => (
                    <div key={beh} className="set-toggle-row">
                      <div>
                        <div className="set-label">{beh.charAt(0) + beh.slice(1).toLowerCase()}</div>
                      </div>
                      <Toggle value={on} onChange={v => update("ai","behaviors",{ ...settings.ai.behaviors, [beh]: v })} />
                    </div>
                  ))}

                  <div className="set-divider" />
                  <div className="set-toggle-row">
                    <div>
                      <div className="set-label">Automatically Save Evidence Clips</div>
                      <div className="set-hint">Automatically save a video clip whenever a detection is triggered</div>
                    </div>
                    <Toggle value={settings.ai.autoCreateEvidence} onChange={v => update("ai","autoCreateEvidence",v)} />
                  </div>
                </div>
              )}

              {/* ── SECURITY ── */}
              {activeTab === "security" && (
                <div className="set-section">
                  <h3 className="set-section-title">Security Settings</h3>

                  <div className="set-field">
                    <label className="set-label">Failed Login Attempts Before Account Lock</label>
                    <div className="set-hint" style={{ marginBottom: 8 }}>
                      Accounts will be temporarily locked after this many consecutive failed login attempts within 2 minutes.
                    </div>
                    <div className="set-input-row">
                      <input className="set-input set-input--short" type="number" min={3} max={10}
                        value={settings.security.maxFailedLogins}
                        onChange={e => update("security","maxFailedLogins",Number(e.target.value))} />
                      <span className="set-unit">attempts</span>
                    </div>
                  </div>

                  <div className="set-field">
                    <label className="set-label">Lockout Duration</label>
                    <div className="set-input-row">
                      <input className="set-input set-input--short" type="number" min={1} max={60}
                        value={settings.security.lockoutDuration}
                        onChange={e => update("security","lockoutDuration",Number(e.target.value))} />
                      <span className="set-unit">minutes — how long a locked account remains inaccessible</span>
                    </div>
                  </div>

                  <div className="set-field">
                    <label className="set-label">Session Timeout</label>
                    <div className="set-input-row">
                      <input className="set-input set-input--short" type="number" min={5} max={480}
                        value={settings.security.sessionTimeout}
                        onChange={e => update("security","sessionTimeout",Number(e.target.value))} />
                      <span className="set-unit">minutes of inactivity before automatic sign-out</span>
                    </div>
                  </div>

                  <div className="set-divider" />
                  <div className="set-toggle-row">
                    <div>
                      <div className="set-label">Require Strong Passwords</div>
                      <div className="set-hint">Enforce minimum 8 characters with uppercase, number, and symbol</div>
                    </div>
                    <Toggle value={settings.security.requireStrongPassword} onChange={v => update("security","requireStrongPassword",v)} />
                  </div>

                  <div className="set-divider" />
                  <div className="set-field">
                    <label className="set-label">Data Retention Period</label>
                    <div className="set-hint" style={{ marginBottom: 8 }}>
                      How long logs and video clips are kept before automatic deletion. Default is 30 days in line with data privacy regulations. Maximum is 90 days.
                    </div>
                    <div className="set-input-row">
                      <input className="set-input set-input--short" type="number" min={7} max={90}
                        value={settings.security.logRetentionDays}
                        onChange={e => update("security","logRetentionDays",Number(e.target.value))} />
                      <span className="set-unit">days</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── BACKUP & RESTORE ── */}
              {activeTab === "backup" && (
                <div className="set-section">
                  <h3 className="set-section-title">Backup & Restore</h3>

                  <div className="set-toggle-row">
                    <div>
                      <div className="set-label">Automatic Backups</div>
                      <div className="set-hint">Automatically back up system data on a schedule</div>
                    </div>
                    <Toggle value={settings.backup.autoBackup} onChange={v => update("backup","autoBackup",v)} />
                  </div>

                  {settings.backup.autoBackup && (<>
                    <div className="set-field">
                      <label className="set-label">Backup Frequency</label>
                      <select className="set-input" value={settings.backup.frequency} onChange={e => update("backup","frequency",e.target.value)}>
                        <option value="hourly">Hourly</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </div>
                    <div className="set-field">
                      <label className="set-label">Backup Time</label>
                      <input className="set-input set-input--short" type="time"
                        value={settings.backup.backupTime}
                        onChange={e => update("backup","backupTime",e.target.value)} />
                    </div>
                    <div className="set-field">
                      <label className="set-label">Keep Backups For</label>
                      <div className="set-input-row">
                        <input className="set-input set-input--short" type="number" min={7} max={90}
                          value={settings.backup.retentionDays}
                          onChange={e => update("backup","retentionDays",Number(e.target.value))} />
                        <span className="set-unit">days</span>
                      </div>
                    </div>
                  </>)}

                  <div className="set-divider" />
                  <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                    <button className="det-btn det-btn--view" style={{ padding: "8px 16px", fontSize: 12 }}
                      onClick={() => alert("TODO: POST /api/backup/trigger/ — create backup now")}>
                      💾 Create Backup Now
                    </button>
                    <button className="det-btn det-btn--ghost" style={{ padding: "8px 16px", fontSize: 12 }}
                      onClick={() => alert("TODO: POST /api/backup/restore/ — upload and restore")}>
                      ↩ Restore from File
                    </button>
                  </div>

                  <div className="set-divider" />
                  <h4 className="set-subsection-title">Backup History</h4>
                  {/* TODO: Replace with GET /api/backup/history/ */}
                  <div className="sg-table-wrap">
                    <table className="sg-table">
                      <thead>
                        <tr><th>Date</th><th>Time</th><th>Type</th><th>Size</th><th>Status</th><th>Action</th></tr>
                      </thead>
                      <tbody>
                        {BACKUP_HISTORY.map(b => (
                          <tr key={b.id}>
                            <td className="sg-td-mono">{b.date}</td>
                            <td className="sg-td-mono">{b.time}</td>
                            <td>{b.type}</td>
                            <td>{b.size}</td>
                            <td>
                              <span className={`sg-chip ${b.status === "Success" ? "sg-stat-REVIEWED" : "sg-stat-ESCALATED"}`}>
                                {b.status}
                              </span>
                            </td>
                            <td>
                              <button className="det-btn det-btn--ghost"
                                onClick={() => alert(`TODO: Download backup ${b.date}`)}>
                                ↓ Download
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
