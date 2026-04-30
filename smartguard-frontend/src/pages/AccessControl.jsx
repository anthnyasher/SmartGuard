// src/pages/AccessControl.jsx
import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  unlockUser,
  toggleUserActive,
  extractApiError,
} from "../api/usersApi.js";
import "./AdminDashboard.css";
import "./shared-components.css";
import "./AccessControl.css";

// ── Nav ───────────────────────────────────────────────────────────────────────
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

// ── Role config ───────────────────────────────────────────────────────────────
const ROLE_OPTIONS = [
  { value: "STAFF",       label: "Store Staff",        desc: "Cashiers, floor staff, security guards" },
  { value: "OPS_MANAGER", label: "Operations Manager", desc: "Floor supervisors and managers"         },
  { value: "ADMIN",       label: "Administrator",      desc: "General Manager or IT Administrator"    },
];

const ROLE_PERMISSIONS = {
  ADMIN: {
    color: "#7c3aed", bg: "rgba(124,58,237,0.1)", border: "rgba(124,58,237,0.2)",
    label: "Administrator",
    description: "Full system access — General Manager or IT Administrator",
    permissions: [
      "View all live camera feeds (all cameras)",
      "Add, edit, and remove camera sources",
      "Receive all alerts across all cameras and zones",
      "Mark alerts as Reviewed, Escalated, or False Positive",
      "Add notes to any alert",
      "Full access to all recorded video clips",
      "Approve or deny evidence download requests",
      "Create, update, and delete user accounts",
      "Assign and modify access levels",
      "Configure AI detection settings and sensitivity",
      "Access all system audit logs",
      "Export logs and incident reports to CSV or PDF",
      "Customize data retention periods",
      "Manage backup and restore operations",
      "View full system health monitoring",
      "Receive SMS and email alerts for all severity levels",
    ],
  },
  OPS_MANAGER: {
    color: "#2563eb", bg: "rgba(37,99,235,0.1)", border: "rgba(37,99,235,0.2)",
    label: "Operations Manager",
    description: "Mid-level access — Floor supervisors and Operations Managers",
    permissions: [
      "View all live camera feeds (assigned zones only)",
      "View camera health status",
      "Receive alerts for assigned cameras and zones only",
      "Mark alerts as Reviewed, Escalated, or False Positive",
      "Add notes to alerts",
      "Read-only access to video clips in assigned zones",
      "Request evidence download (requires Admin approval)",
      "View incident records for assigned cameras",
      "View detection trends and analytics dashboard",
      "Receive SMS and email alerts for HIGH and CRITICAL events",
    ],
  },
  STAFF: {
    color: "#64748b", bg: "rgba(100,116,139,0.1)", border: "rgba(100,116,139,0.2)",
    label: "Store Staff",
    description: "Minimal access — Cashiers, floor staff, and security guards",
    permissions: [
      "Receive general shoplifting alerts (camera location and time only)",
      "Acknowledge receipt of alerts",
      "Trigger the store alarm on active alerts",
      "Receive SMS and email alerts for HIGH and CRITICAL events",
    ],
  },
};

const ROLE_LABELS = {
  ADMIN:       "Administrator",
  OPS_MANAGER: "Ops Manager",
  STAFF:       "Store Staff",
};

// ── Phone number helpers ───────────────────────────────────────────────────────
function formatPhoneDisplay(phone) {
  if (!phone) return null;
  // Show last 4 digits masked: +63917●●●●456 → "+63 *** ***" style
  return phone;
}

function validatePhone(value) {
  if (!value || value.trim() === "") return null; // optional field
  const cleaned = value.trim().replace(/\s/g, "").replace(/-/g, "");
  if (!/^\+\d{7,15}$/.test(cleaned)) {
    return "Enter a valid international number starting with + (e.g. +639171234567).";
  }
  return null;
}

// ── Toast notification ────────────────────────────────────────────────────────
function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 3800);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;
  const isSuccess = toast.type === "success";
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 18px", borderRadius: 10, maxWidth: 400,
      background: isSuccess ? "rgba(22,163,74,0.12)"  : "rgba(220,38,38,0.12)",
      border: `1px solid ${isSuccess ? "rgba(22,163,74,0.35)" : "rgba(220,38,38,0.35)"}`,
      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
      animation: "cfm-up 0.2s ease-out",
    }}>
      <span style={{ fontSize: 20 }}>{isSuccess ? "✅" : "❌"}</span>
      <span style={{
        fontSize: 13, fontWeight: 500,
        color: isSuccess ? "var(--accent-green)" : "var(--accent-red)",
        flex: 1,
      }}>{toast.message}</span>
      <button onClick={onDismiss} style={{
        background: "none", border: "none", cursor: "pointer",
        fontSize: 14, color: "var(--text-muted)", padding: "0 2px",
      }}>✕</button>
    </div>
  );
}

// ── Add / Edit User Modal ─────────────────────────────────────────────────────
const EMPTY_FORM = {
  username: "", email: "", first_name: "", last_name: "",
  password: "", phone_number: "", role: "STAFF", is_active: true,
};

function UserFormModal({ mode, user, saving, error, onSave, onClose }) {
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [showPw,     setShowPw]     = useState(false);
  const [phoneError, setPhoneError] = useState(null);
  const isEdit = mode === "edit";

  useEffect(() => {
    if (isEdit && user) {
      setForm({
        username:     user.username     ?? "",
        email:        user.email        ?? "",
        first_name:   user.first_name   ?? "",
        last_name:    user.last_name    ?? "",
        password:     "",
        phone_number: user.phone_number ?? "",
        role:         user.role         ?? "STAFF",
        is_active:    user.is_active    ?? true,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setPhoneError(null);
  }, [mode, user]);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const set = (field) => (e) => {
    const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [field]: val }));
    if (field === "phone_number") setPhoneError(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Client-side phone validation
    const phoneErr = validatePhone(form.phone_number);
    if (phoneErr) {
      setPhoneError(phoneErr);
      return;
    }

    const payload = {
      username:     form.username.trim(),
      email:        form.email.trim(),
      first_name:   form.first_name.trim(),
      last_name:    form.last_name.trim(),
      role:         form.role,
      is_active:    form.is_active,
      phone_number: form.phone_number.trim().replace(/\s/g, "").replace(/-/g, ""),
    };
    if (!isEdit) payload.password = form.password;
    onSave(payload);
  };

  const rp = ROLE_PERMISSIONS[form.role] ?? ROLE_PERMISSIONS.STAFF;

  return (
    <div className="cfm-overlay" onClick={onClose}>
      <div className="cfm-modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="cfm-header">
          <div className="cfm-header-left">
            <div className="cfm-header-icon" style={{
              background: `linear-gradient(135deg, ${rp.color}, ${rp.color}cc)`,
            }}>👤</div>
            <div>
              <h2 className="cfm-title">{isEdit ? "Edit User Account" : "Add New User Account"}</h2>
              <p className="cfm-subtitle">
                {isEdit ? `Editing: ${user?.username}` : "Create a new SmartGuard system account"}
              </p>
            </div>
          </div>
          <button className="cfm-close" onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        {/* Server-side error */}
        {error && (
          <div className="cfm-error">
            <span className="cfm-error-icon">⚠</span>
            {error}
          </div>
        )}

        {/* Form */}
        <form className="cfm-body" onSubmit={handleSubmit} autoComplete="off">

          {/* ── Section: Identity ── */}
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
            color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4,
          }}>
            Identity
          </div>

          {/* Name row */}
          <div className="cfm-row">
            <div className="cfm-field" style={{ flex: 1 }}>
              <label className="cfm-label">
                First Name <span className="cfm-required">*</span>
              </label>
              <input className="cfm-input" type="text"
                placeholder="e.g. Juan"
                value={form.first_name} onChange={set("first_name")}
                required autoFocus
              />
            </div>
            <div className="cfm-field" style={{ flex: 1 }}>
              <label className="cfm-label">Last Name</label>
              <input className="cfm-input" type="text"
                placeholder="e.g. Dela Cruz"
                value={form.last_name} onChange={set("last_name")}
              />
            </div>
          </div>

          {/* Username */}
          <div className="cfm-field">
            <label className="cfm-label">
              Username <span className="cfm-required">*</span>
              <span className="cfm-label-hint"> — used to log in</span>
            </label>
            <input className="cfm-input cfm-input--mono" type="text"
              placeholder="e.g. juan.delacruz"
              value={form.username} onChange={set("username")}
              required
            />
          </div>

          {/* ── Section: Contact ── */}
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
            color: "var(--text-muted)", textTransform: "uppercase",
            marginTop: 6, marginBottom: 4, paddingTop: 10,
            borderTop: "1px solid var(--border-subtle)",
          }}>
            Contact &amp; Notifications
          </div>

          {/* Email + Phone row */}
          <div className="cfm-row">
            <div className="cfm-field" style={{ flex: 1 }}>
              <label className="cfm-label">
                Email Address <span className="cfm-required">*</span>
                <span className="cfm-label-hint"> — email alerts</span>
              </label>
              <input className="cfm-input" type="email"
                placeholder="e.g. juan@fairprice.com"
                value={form.email} onChange={set("email")}
                required
              />
            </div>
            <div className="cfm-field" style={{ flex: 1 }}>
              <label className="cfm-label">
                Mobile Number
                <span className="cfm-label-hint"> — SMS alerts</span>
              </label>
              <div style={{ position: "relative" }}>
                <span style={{
                  position: "absolute", left: 11, top: "50%",
                  transform: "translateY(-50%)", fontSize: 13,
                  pointerEvents: "none", userSelect: "none",
                }}>📱</span>
                <input
                  className="cfm-input cfm-input--mono"
                  type="tel"
                  placeholder="+639171234567"
                  value={form.phone_number}
                  onChange={set("phone_number")}
                  style={{
                    paddingLeft: 34,
                    borderColor: phoneError ? "var(--accent-red)" : undefined,
                  }}
                />
              </div>
              {phoneError ? (
                <p className="cfm-note" style={{ color: "var(--accent-red)" }}>
                  ⚠ {phoneError}
                </p>
              ) : (
                <p className="cfm-note">
                  E.164 format (+63 prefix for Philippine numbers). Used by Twilio to
                  send real-time SMS alerts when shoplifting is detected.
                  Leave blank to disable SMS for this user.
                </p>
              )}
            </div>
          </div>

          {/* ── Section: Credentials ── */}
          {!isEdit && (
            <>
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
                color: "var(--text-muted)", textTransform: "uppercase",
                marginTop: 6, marginBottom: 4, paddingTop: 10,
                borderTop: "1px solid var(--border-subtle)",
              }}>
                Credentials
              </div>

              <div className="cfm-field">
                <label className="cfm-label">
                  Password <span className="cfm-required">*</span>
                  <span className="cfm-label-hint"> — minimum 8 characters</span>
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    className="cfm-input"
                    type={showPw ? "text" : "password"}
                    placeholder="Minimum 8 characters"
                    value={form.password}
                    onChange={set("password")}
                    required minLength={8}
                    style={{ paddingRight: 44 }}
                  />
                  <button type="button" onClick={() => setShowPw(p => !p)}
                    style={{
                      position: "absolute", right: 10, top: "50%",
                      transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 14, color: "var(--text-muted)",
                    }}>
                    {showPw ? "🙈" : "👁"}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── Section: Access ── */}
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
            color: "var(--text-muted)", textTransform: "uppercase",
            marginTop: 6, marginBottom: 4, paddingTop: 10,
            borderTop: "1px solid var(--border-subtle)",
          }}>
            Role &amp; Access
          </div>

          {/* Role + Active toggle */}
          <div className="cfm-row" style={{ alignItems: "flex-start" }}>
            <div className="cfm-field" style={{ flex: 1 }}>
              <label className="cfm-label">
                System Role <span className="cfm-required">*</span>
              </label>
              <select className="cfm-input" value={form.role} onChange={set("role")}>
                {ROLE_OPTIONS.map(r => (
                  <option key={r.value} value={r.value}>
                    {r.label} — {r.desc}
                  </option>
                ))}
              </select>

              {/* Live role capability preview */}
              <div style={{
                marginTop: 8, padding: "8px 10px",
                background: rp.bg,
                border: `1px solid ${rp.border}`,
                borderRadius: "var(--radius-sm)",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: rp.color, marginBottom: 4 }}>
                  {rp.label.toUpperCase()} — CAPABILITIES
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  {rp.permissions.slice(0, 3).map((p, i) => (
                    <div key={i}>✓ {p}</div>
                  ))}
                  {rp.permissions.length > 3 && (
                    <div style={{ color: "var(--text-muted)", marginTop: 2 }}>
                      +{rp.permissions.length - 3} more permissions
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="cfm-field cfm-field--toggle">
              <label className="cfm-label">Account Status</label>
              <label className="cfm-toggle">
                <input type="checkbox" checked={form.is_active} onChange={set("is_active")} />
                <span className="cfm-toggle-slider" />
                <span className="cfm-toggle-text">{form.is_active ? "Active" : "Inactive"}</span>
              </label>
              <p className="cfm-note" style={{ marginTop: 6 }}>
                Inactive accounts cannot log in but their data is preserved.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="cfm-footer">
            <button type="button" className="cfm-btn-cancel" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="cfm-btn-save"
              style={{ background: `linear-gradient(135deg, ${rp.color}, ${rp.color}bb)` }}
              disabled={saving}
            >
              {saving
                ? <><span className="cfm-spinner" /> Saving...</>
                : isEdit ? "Save Changes" : "Create Account"
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Reset Password Modal ──────────────────────────────────────────────────────
function ResetPasswordModal({ user, saving, error, onSave, onClose }) {
  const [pw,      setPw]      = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw,  setShowPw]  = useState(false);
  const mismatch = confirm.length > 0 && pw !== confirm;

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mismatch) return;
    onSave(pw, confirm);
  };

  return (
    <div className="cfm-overlay" onClick={onClose}>
      <div className="cfm-modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="cfm-header">
          <div className="cfm-header-left">
            <div className="cfm-header-icon" style={{ background: "linear-gradient(135deg,#b45309,#d97706)" }}>🔑</div>
            <div>
              <h2 className="cfm-title">Reset Password</h2>
              <p className="cfm-subtitle">For user: <strong>{user?.username}</strong></p>
            </div>
          </div>
          <button className="cfm-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="cfm-error"><span className="cfm-error-icon">⚠</span>{error}</div>}
        <form className="cfm-body" onSubmit={handleSubmit}>
          <div className="cfm-field">
            <label className="cfm-label">New Password <span className="cfm-required">*</span></label>
            <div style={{ position: "relative" }}>
              <input className="cfm-input"
                type={showPw ? "text" : "password"}
                placeholder="Minimum 8 characters"
                value={pw} onChange={e => setPw(e.target.value)}
                required minLength={8} autoFocus style={{ paddingRight: 44 }}
              />
              <button type="button" onClick={() => setShowPw(p => !p)}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--text-muted)" }}>
                {showPw ? "🙈" : "👁"}
              </button>
            </div>
          </div>
          <div className="cfm-field">
            <label className="cfm-label">Confirm Password <span className="cfm-required">*</span></label>
            <input className="cfm-input"
              type={showPw ? "text" : "password"}
              placeholder="Re-enter new password"
              value={confirm} onChange={e => setConfirm(e.target.value)}
              required
              style={{ borderColor: mismatch ? "var(--accent-red)" : undefined }}
            />
            {mismatch && <p className="cfm-note" style={{ color: "var(--accent-red)" }}>Passwords do not match.</p>}
          </div>
          <div className="cfm-footer">
            <button type="button" className="cfm-btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="cfm-btn-save" disabled={saving || mismatch || !pw}
              style={{ background: "linear-gradient(135deg,#b45309,#d97706)" }}>
              {saving ? <><span className="cfm-spinner" /> Resetting...</> : "Reset Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirmation Modal ─────────────────────────────────────────────────
function DeleteConfirmModal({ user, deleting, onConfirm, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="cfm-overlay" onClick={onClose}>
      <div style={{
        background: "var(--bg-surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "28px 28px 24px",
        width: "100%", maxWidth: 420, textAlign: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)", animation: "cfm-up 0.2s ease-out",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🗑</div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>
          Delete User Account?
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 6 }}>
          <strong>{user?.username}</strong> ({user?.email}) will be permanently removed from SmartGuard.
        </p>
        <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 22 }}>
          All alerts and logs created by this user will remain in the database. This action cannot be undone.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          <button className="cfm-btn-cancel" onClick={onClose} disabled={deleting}>Cancel</button>
          <button onClick={onConfirm} disabled={deleting} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif", border: "none",
            borderRadius: "var(--radius-sm)", background: "var(--accent-red)",
            color: "#fff", cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.5 : 1,
          }}>
            {deleting ? "Deleting..." : "Yes, Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Unlock Confirmation Modal ─────────────────────────────────────────────────
function UnlockConfirmModal({ user, working, onConfirm, onClose }) {
  return (
    <div className="cfm-overlay" onClick={onClose}>
      <div style={{
        background: "var(--bg-surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "28px 28px 24px",
        width: "100%", maxWidth: 400, textAlign: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)", animation: "cfm-up 0.2s ease-out",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>🔓</div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          Unlock Account?
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 20 }}>
          <strong>{user?.username}</strong> is currently locked due to failed login attempts.
          Unlocking will reset their attempt counter immediately.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          <button className="cfm-btn-cancel" onClick={onClose} disabled={working}>Cancel</button>
          <button onClick={onConfirm} disabled={working} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif", border: "none",
            borderRadius: "var(--radius-sm)", background: "var(--accent-green)",
            color: "#fff", cursor: working ? "not-allowed" : "pointer", opacity: working ? 0.5 : 1,
          }}>
            {working ? "Unlocking..." : "Unlock Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════════════════
export default function AccessControl() {
  const { user: currentUser, token, logout } = useAuth();
  const navigate = useNavigate();

  // ── Data state ──────────────────────────────────────────────────────────────
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [roleFilter,       setRoleFilter]       = useState("ALL");
  const [search,           setSearch]           = useState("");
  const [selectedRole,     setSelectedRole]     = useState("ADMIN");
  const [showPhones,       setShowPhones]       = useState(false); // privacy toggle

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [modal,        setModal]        = useState(null); // "add"|"edit"|"delete"|"password"|"unlock"
  const [selectedUser, setSelectedUser] = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [working,      setWorking]      = useState(false);
  const [modalError,   setModalError]   = useState(null);

  // ── Toast ───────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const showToast = (type, message) => setToast({ type, message });

  // ── Load users ──────────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getUsers(token);
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleLogout = () => { logout(); navigate("/login", { replace: true }); };

  // ── Open / close helpers ────────────────────────────────────────────────────
  const openModal  = (type, u = null) => { setSelectedUser(u); setModalError(null); setModal(type); };
  const closeModal = ()               => { setModal(null); setSelectedUser(null); setModalError(null); };

  // ── CRUD handlers ────────────────────────────────────────────────────────────

  const handleAdd = async (data) => {
    setSaving(true); setModalError(null);
    try {
      await createUser(token, data);
      await loadUsers();
      closeModal();
      showToast("success", `Account for "${data.username}" created successfully.`);
    } catch (err) {
      setModalError(extractApiError(err));
    } finally { setSaving(false); }
  };

  const handleEdit = async (data) => {
    setSaving(true); setModalError(null);
    try {
      await updateUser(token, selectedUser.id, data);
      await loadUsers();
      closeModal();
      showToast("success", `User "${data.username}" updated successfully.`);
    } catch (err) {
      setModalError(extractApiError(err));
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setWorking(true);
    try {
      await deleteUser(token, selectedUser.id);
      await loadUsers();
      closeModal();
      showToast("success", `User "${selectedUser.username}" deleted.`);
    } catch (err) {
      closeModal();
      showToast("error", extractApiError(err));
    } finally { setWorking(false); }
  };

  const handleResetPassword = async (pw, confirm) => {
    setSaving(true); setModalError(null);
    try {
      await resetUserPassword(token, selectedUser.id, pw, confirm);
      closeModal();
      showToast("success", `Password for "${selectedUser.username}" has been reset.`);
    } catch (err) {
      setModalError(extractApiError(err));
    } finally { setSaving(false); }
  };

  const handleUnlock = async () => {
    setWorking(true);
    try {
      await unlockUser(token, selectedUser.id);
      await loadUsers();
      closeModal();
      showToast("success", `Account "${selectedUser.username}" has been unlocked.`);
    } catch (err) {
      closeModal();
      showToast("error", extractApiError(err));
    } finally { setWorking(false); }
  };

  const handleToggleActive = async (u) => {
    try {
      await toggleUserActive(token, u.id);
      await loadUsers();
      const next = !u.is_active;
      showToast("success", `"${u.username}" has been ${next ? "activated" : "deactivated"}.`);
    } catch (err) {
      showToast("error", extractApiError(err));
    }
  };

  // ── Filtered data ────────────────────────────────────────────────────────────
  const filtered = users.filter(u => {
    if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
    if (search) {
      const q    = search.toLowerCase();
      const name = `${u.first_name} ${u.last_name}`.toLowerCase();
      if (!name.includes(q) && !u.email.toLowerCase().includes(q)
          && !u.username.toLowerCase().includes(q)
          && !(u.phone_number || "").includes(q)) {
        return false;
      }
    }
    return true;
  });

  const activeCount   = users.filter(u => u.is_active).length;
  const inactiveCount = users.filter(u => !u.is_active).length;
  const lockedCount   = users.filter(u => u.is_locked).length;
  const smsCount      = users.filter(u => u.phone_number).length;
  const totalFailed   = users.reduce((acc, u) => acc + (u.failed_logins ?? 0), 0);

  const perm = ROLE_PERMISSIONS[selectedRole] ?? ROLE_PERMISSIONS.ADMIN;

  const displayName = (u) => {
    const n = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
    return n || u.username;
  };

  const formatDate = (d) => {
    if (!d) return "Never";
    return new Date(d).toLocaleString([], {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const isSelf = (u) => u.id === currentUser?.id;

  return (
    <div className="sg-layout">

      {/* ── Sidebar ── */}
      <aside className={`sg-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sg-sidebar-logo">
          <div className="sg-logo-icon">🛡</div>
          {!sidebarCollapsed && (
            <span className="sg-logo-text">
              <span className="sg-logo-smart">SMART</span>
              <span className="sg-logo-guard">GUARD</span>
            </span>
          )}
        </div>
        <nav className="sg-sidebar-nav">
          {NAV_ITEMS.map(item => (
            <Link key={item.id} to={item.path}
              className={`sg-nav-item${item.id === "access" ? " sg-nav-active" : ""}`}>
              <span className="sg-nav-icon">{item.icon}</span>
              {!sidebarCollapsed && <span className="sg-nav-label">{item.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="sg-sidebar-footer">
          <div className="sg-user-row">
            <div className="sg-user-avatar">{currentUser?.email?.[0]?.toUpperCase() || "A"}</div>
            {!sidebarCollapsed && (
              <div className="sg-user-info">
                <div className="sg-user-name">{currentUser?.email}</div>
                <div className="sg-user-role">{currentUser?.role}</div>
              </div>
            )}
          </div>
          {!sidebarCollapsed && <button className="sg-logout-btn" onClick={handleLogout}>Logout</button>}
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="sg-main">
        <header className="sg-topbar">
          <div className="sg-topbar-left">
            <button className="sg-collapse-btn" onClick={() => setSidebarCollapsed(p => !p)}>☰</button>
            <div className="sg-breadcrumb">
              <span className="sg-breadcrumb-root">Dashboard</span>
              <span className="sg-breadcrumb-sep">›</span>
              <span className="sg-breadcrumb-current">Access Control</span>
            </div>
          </div>
          <div className="sg-topbar-right">
            {/* Privacy toggle for phone numbers */}
            <button
              onClick={() => setShowPhones(p => !p)}
              style={{
                padding: "6px 14px", fontSize: 12, fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                background: showPhones ? "rgba(37,99,235,0.08)" : "var(--bg-surface)",
                color: showPhones ? "var(--accent-blue)" : "var(--text-muted)",
                cursor: "pointer", transition: "all 0.14s",
                display: "flex", alignItems: "center", gap: 6,
              }}
              title={showPhones ? "Hide phone numbers" : "Reveal phone numbers"}
            >
              <span>{showPhones ? "🙈" : "👁"}</span>
              <span>{showPhones ? "Hide Phones" : "Show Phones"}</span>
            </button>

            <button className="sg-pdf-btn" onClick={() => openModal("add")}>
              + Add User
            </button>
          </div>
        </header>

        <div className="sg-content">
          <h1 className="sg-page-title">Access Control</h1>

          {/* KPI Strip */}
          <div className="sg-kpi-strip" style={{ gridTemplateColumns: "repeat(5,1fr)", marginBottom: 20 }}>
            {[
              { label: "Total Users",   val: users.length,  icon: "👥", cls: "kpi-blue",   iconCls: "kpi-icon-blue"   },
              { label: "Active",        val: activeCount,   icon: "✓",  cls: "kpi-green",  iconCls: "kpi-icon-green"  },
              { label: "Inactive",      val: inactiveCount, icon: "✕",  cls: "kpi-red",    iconCls: "kpi-icon-red"    },
              { label: "SMS Enabled",   val: smsCount,      icon: "📱", cls: "kpi-purple", iconCls: "kpi-icon-purple" },
              { label: "Failed Logins", val: totalFailed,   icon: "⚠",  cls: "kpi-amber",  iconCls: "kpi-icon-amber"  },
            ].map(k => (
              <div key={k.label} className={`sg-kpi ${k.cls}`}>
                <div className={`sg-kpi-icon-wrap ${k.iconCls}`}>{k.icon}</div>
                <div>
                  <div className="sg-kpi-val">{loading ? "—" : k.val}</div>
                  <div className="sg-kpi-label">{k.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Locked accounts banner */}
          {!loading && lockedCount > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", marginBottom: 16,
              background: "rgba(220,38,38,0.06)",
              border: "1px solid rgba(220,38,38,0.2)",
              borderRadius: "var(--radius-sm)", fontSize: 13,
              color: "var(--accent-red)", fontWeight: 500,
            }}>
              <span>🔐</span>
              <span>
                {lockedCount} account{lockedCount > 1 ? "s are" : " is"} currently locked due to failed login attempts.
                Use the <strong>Unlock</strong> button in the table below to restore access.
              </span>
            </div>
          )}

          <div className="ac-layout">
            {/* ── Users Table ── */}
            <div className="sg-card" style={{ flex: 1, minWidth: 0 }}>

              {/* Filters */}
              <div className="det-filters-bar">
                <div className="det-search-wrap" style={{ flex: 1 }}>
                  <span className="det-search-icon">🔍</span>
                  <input className="det-search"
                    placeholder="Search by name, username, email, or phone..."
                    value={search} onChange={e => setSearch(e.target.value)}
                  />
                  {search && (
                    <button onClick={() => setSearch("")} style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 12, color: "var(--text-muted)", padding: "0 4px",
                    }}>✕</button>
                  )}
                </div>
                <div className="det-filter-group">
                  <label className="det-filter-label">Role</label>
                  <div className="det-filter-tabs">
                    {["ALL", "ADMIN", "OPS_MANAGER", "STAFF"].map(r => (
                      <button key={r}
                        className={`det-filter-tab${roleFilter === r ? " det-filter-tab--active" : ""}`}
                        onClick={() => setRoleFilter(r)}>
                        {r === "ALL" ? "All" : ROLE_LABELS[r]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Table */}
              {loading ? (
                <div className="sg-loading"><div className="sg-spinner" /> Loading users…</div>
              ) : error ? (
                <div className="sg-empty" style={{ color: "var(--accent-red)" }}>
                  <span>⚠</span> {error}
                  <button onClick={loadUsers} className="det-btn det-btn--view" style={{ marginLeft: 10 }}>
                    Retry
                  </button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="sg-empty">
                  {search ? `No users match "${search}".` : "No users found."}
                </div>
              ) : (
                <div className="sg-table-wrap">
                  <table className="sg-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>USER</th>
                        <th>ROLE</th>
                        <th>PHONE / SMS</th>
                        <th>STATUS</th>
                        <th>LAST LOGIN</th>
                        <th>FAILED</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((u, i) => {
                        const rp   = ROLE_PERMISSIONS[u.role] ?? ROLE_PERMISSIONS.STAFF;
                        const self = isSelf(u);
                        return (
                          <tr key={u.id}
                            style={{ cursor: "pointer", opacity: u.is_active ? 1 : 0.6 }}
                            onClick={() => setSelectedRole(u.role)}>
                            <td className="sg-td-mono">{i + 1}</td>

                            {/* User cell */}
                            <td>
                              <div className="ac-user-cell">
                                <div className="ac-user-avatar"
                                  style={{ background: `linear-gradient(135deg, ${rp.color}, ${rp.color}88)` }}>
                                  {displayName(u)[0]?.toUpperCase()}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                                    {displayName(u)}
                                    {self && (
                                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "rgba(37,99,235,0.1)", color: "var(--accent-blue)", fontWeight: 700 }}>
                                        YOU
                                      </span>
                                    )}
                                    {u.is_locked && (
                                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "rgba(220,38,38,0.1)", color: "var(--accent-red)", fontWeight: 700 }}>
                                        🔐 LOCKED
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                    @{u.username} · {u.email}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Role */}
                            <td>
                              <span className="ac-role-badge" style={{
                                color: rp.color, background: rp.bg,
                                border: `1px solid ${rp.border}`,
                              }}>
                                {ROLE_LABELS[u.role] ?? u.role}
                              </span>
                            </td>

                            {/* Phone / SMS column */}
                            <td>
                              {u.phone_number ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                  <span style={{
                                    fontFamily: "'Space Mono', monospace", fontSize: 11,
                                    color: "var(--text-secondary)",
                                  }}>
                                    {showPhones ? u.phone_number : u.phone_number.slice(0, 4) + "●●●●" + u.phone_number.slice(-3)}
                                  </span>
                                  <span style={{
                                    fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
                                    color: "var(--accent-green)",
                                    fontFamily: "'Space Mono', monospace",
                                  }}>
                                    ● SMS ON
                                  </span>
                                </div>
                              ) : (
                                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>— no SMS</span>
                              )}
                            </td>

                            {/* Status */}
                            <td>
                              <span className={`sg-chip ${u.is_active ? "sg-stat-REVIEWED" : "sg-stat-FALSE_POSITIVE"}`}>
                                {u.is_active ? "ACTIVE" : "INACTIVE"}
                              </span>
                            </td>

                            {/* Last login */}
                            <td className="sg-td-mono" style={{ fontSize: 11 }}>
                              {formatDate(u.last_login)}
                            </td>

                            {/* Failed logins */}
                            <td style={{
                              fontWeight: 600,
                              color: (u.failed_logins ?? 0) > 0 ? "var(--accent-red)" : "var(--text-muted)",
                            }}>
                              {u.failed_logins ?? 0}
                            </td>

                            {/* Actions */}
                            <td onClick={e => e.stopPropagation()}>
                              <div className="det-action-btns">
                                <button className="ac-btn-edit"
                                  onClick={() => openModal("edit", u)}>
                                  ✎ Edit
                                </button>
                                <button className="ac-btn-edit"
                                  style={{ color: "#b45309", borderColor: "rgba(180,83,9,0.25)", background: "rgba(180,83,9,0.06)" }}
                                  onClick={() => openModal("password", u)}>
                                  🔑 Password
                                </button>
                                {u.is_locked && (
                                  <button className="ac-btn-activate"
                                    onClick={() => openModal("unlock", u)}>
                                    Unlock
                                  </button>
                                )}
                                {!self && (
                                  <button
                                    className={u.is_active ? "ac-btn-deactivate" : "ac-btn-activate"}
                                    onClick={() => handleToggleActive(u)}>
                                    {u.is_active ? "Deactivate" : "Activate"}
                                  </button>
                                )}
                                {!self && (
                                  <button
                                    onClick={() => openModal("delete", u)}
                                    style={{
                                      width: 26, height: 26, display: "flex",
                                      alignItems: "center", justifyContent: "center",
                                      border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                                      background: "var(--bg-base)", color: "var(--text-muted)",
                                      cursor: "pointer", fontSize: 12, transition: "all 0.14s",
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(220,38,38,0.07)"; e.currentTarget.style.color = "var(--accent-red)"; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-base)"; e.currentTarget.style.color = "var(--text-muted)"; }}
                                  >
                                    🗑
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="det-table-footer">
                <span className="det-count-label">
                  Showing {filtered.length} of {users.length} users
                  {smsCount > 0 && (
                    <span style={{ marginLeft: 10, color: "var(--accent-green)", fontWeight: 600 }}>
                      · {smsCount} with SMS enabled
                    </span>
                  )}
                </span>
                <button onClick={loadUsers} style={{
                  background: "none", border: "1px solid var(--border)", cursor: "pointer",
                  borderRadius: "var(--radius-sm)", padding: "4px 10px", fontSize: 11,
                  color: "var(--text-muted)", fontFamily: "'DM Sans', sans-serif",
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  ↻ Refresh
                </button>
              </div>
            </div>

            {/* ── Role Permissions Panel ── */}
            <div className="sg-card ac-permissions-panel">
              <div className="sg-card-header">
                <h2 className="sg-card-title">Role Permissions</h2>
              </div>
              <div className="det-filter-tabs" style={{ marginBottom: 16 }}>
                {["ADMIN", "OPS_MANAGER", "STAFF"].map(r => {
                  const rp = ROLE_PERMISSIONS[r];
                  return (
                    <button key={r}
                      className={`det-filter-tab${selectedRole === r ? " det-filter-tab--active" : ""}`}
                      style={selectedRole === r ? { color: rp.color } : {}}
                      onClick={() => setSelectedRole(r)}>
                      {r === "OPS_MANAGER" ? "OPS" : r}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginBottom: 14 }}>
                <span className="ac-role-badge" style={{
                  color: perm.color, background: perm.bg,
                  border: `1px solid ${perm.border}`, fontSize: 11,
                }}>
                  {perm.label}
                </span>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
                  {perm.description}
                </p>
              </div>
              <div className="ac-perm-list">
                {perm.permissions.map((p, i) => (
                  <div key={i} className="ac-perm-item">
                    <span className="ac-perm-check" style={{ color: perm.color }}>✓</span>
                    <span className="ac-perm-name">{p}</span>
                  </div>
                ))}
              </div>

              {/* SMS legend */}
              <div style={{
                marginTop: 16, padding: "10px 12px",
                background: "rgba(37,99,235,0.04)",
                border: "1px solid rgba(37,99,235,0.12)",
                borderRadius: "var(--radius-sm)",
                fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6,
              }}>
                <div style={{ fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                  📱 SMS Alert Routing
                </div>
                Users with a phone number configured will receive Twilio SMS alerts
                when a HIGH or CRITICAL shoplifting event is detected.
                Add the number when creating or editing any account.
              </div>

              <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 14, lineHeight: 1.5, borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
                💡 Click any row in the table to preview permissions for that user's role.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {modal === "add" && (
        <UserFormModal mode="add" saving={saving} error={modalError}
          onSave={handleAdd} onClose={closeModal} />
      )}
      {modal === "edit" && selectedUser && (
        <UserFormModal mode="edit" user={selectedUser} saving={saving} error={modalError}
          onSave={handleEdit} onClose={closeModal} />
      )}
      {modal === "password" && selectedUser && (
        <ResetPasswordModal user={selectedUser} saving={saving} error={modalError}
          onSave={handleResetPassword} onClose={closeModal} />
      )}
      {modal === "delete" && selectedUser && (
        <DeleteConfirmModal user={selectedUser} deleting={working}
          onConfirm={handleDelete} onClose={closeModal} />
      )}
      {modal === "unlock" && selectedUser && (
        <UnlockConfirmModal user={selectedUser} working={working}
          onConfirm={handleUnlock} onClose={closeModal} />
      )}

      {/* ── Toast ── */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
