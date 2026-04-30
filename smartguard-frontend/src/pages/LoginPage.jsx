// src/pages/LoginPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
// v4: Removes all countdown timer references.
//     Locked state shows a distinct red panel with no time reference.
//     Forgot password flow built in.
//     OPS_MANAGER redirect fixed.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  loginApi,
  verifyOtpApi,
  forgotPasswordApi,
  resetPasswordConfirmApi,
} from "../api/authApi";
import { useAuth } from "../context/AuthContext.jsx";
import "./LoginPage.css";

// ── Shared 6-box OTP input ─────────────────────────────────────────────────
function OTPBoxes({ onComplete, disabled }) {
  const [digits, setDigits] = useState(["","","","","",""]);
  const refs = useRef([]);

  useEffect(() => { refs.current[0]?.focus(); }, []);

  const go = (i, val) => {
    const d    = val.replace(/\D/g, "").slice(-1);
    const next = [...digits]; next[i] = d;
    setDigits(next);
    if (d && i < 5) refs.current[i + 1]?.focus();
    const code = next.join("");
    if (code.length === 6) onComplete(code);
  };

  const key = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const paste = (e) => {
    const t = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!t) return;
    e.preventDefault();
    const n = [...digits];
    for (let i = 0; i < 6; i++) n[i] = t[i] || "";
    setDigits(n);
    refs.current[Math.min(t.length, 5)]?.focus();
    if (n.join("").length === 6) onComplete(n.join(""));
  };

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }} onPaste={paste}>
      {digits.map((d, i) => (
        <input key={i} ref={el => { refs.current[i] = el; }}
          type="text" inputMode="numeric" maxLength={1}
          value={d} disabled={disabled}
          onChange={e => go(i, e.target.value)}
          onKeyDown={e => key(i, e)}
          style={{
            width: 44, height: 52, textAlign: "center",
            fontSize: 22, fontWeight: 700,
            fontFamily: "'Space Mono', monospace",
            border: `2.5px solid ${d ? "#2563eb" : "#d0d7e8"}`,
            borderRadius: 10, background: d ? "rgba(37,99,235,0.05)" : "#f8faff",
            outline: "none", transition: "all 0.14s", color: "#0d1424",
            opacity: disabled ? 0.5 : 1,
            boxShadow: d ? "0 0 0 3px rgba(37,99,235,0.1)" : "none",
          }}
        />
      ))}
    </div>
  );
}

// ── Account Locked Panel (permanent — no countdown) ────────────────────────
function LockedPanel({ onTryOther }) {
  return (
    <div className="login-card login-card--locked" style={{ padding: "28px 24px" }}>
      {/* Icon with pulse ring */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ position: "relative", display: "inline-block" }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "rgba(220,38,38,0.1)",
            border: "1.5px solid rgba(220,38,38,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 30, margin: "0 auto",
          }}>
            🔐
          </div>
          {/* Pulse ring */}
          <div style={{
            position: "absolute", inset: -6, borderRadius: "50%",
            border: "2px solid rgba(220,38,38,0.3)",
            animation: "lm-pulse 2.2s ease-in-out infinite",
            pointerEvents: "none",
          }} />
        </div>
      </div>

      {/* Message */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#dc2626", marginBottom: 8 }}>
          Account Access Restricted
        </div>
        <p style={{
          fontSize: 13.5, color: "#64748b", lineHeight: 1.7,
          background: "rgba(220,38,38,0.04)",
          border: "1px solid rgba(220,38,38,0.12)",
          borderRadius: 8, padding: "12px 16px",
        }}>
          This account has been <strong style={{ color: "#dc2626" }}>locked</strong> after
          too many failed login attempts.
        </p>
      </div>

      {/* What to do */}
      <div style={{
        background: "#f8faff", border: "1px solid #e2e8f0",
        borderRadius: 8, padding: "12px 14px", marginBottom: 18,
        fontSize: 12.5, color: "#475569", lineHeight: 1.65,
      }}>
        <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>What to do next:</div>
        <div>1. Contact your <strong>system administrator</strong> to unlock your account.</div>
        <div style={{ marginTop: 4 }}>2. Or use <strong>Forgot Password</strong> to reset — this also unlocks your account.</div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={onTryOther} className="login-btn"
          style={{ background: "linear-gradient(135deg,#64748b,#475569)" }}>
          ← Try a Different Account
        </button>
      </div>
    </div>
  );
}

// ── Credentials Step ──────────────────────────────────────────────────────
function CredentialsStep({ onSuccess, onForgotPassword }) {
  const [id,        setId]        = useState("");
  const [pw,        setPw]        = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [locked,    setLocked]    = useState(false);
  const [remaining, setRemaining] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (locked) return;
    setError(null); setLoading(true);
    try {
      const data = await loginApi(id, pw);
      onSuccess(data);
    } catch (err) {
      const res    = err?.response?.data;
      const status = err?.response?.status;
      if ((status === 403 || status === 429) && res?.locked) {
        setLocked(true); setError(null);
      } else if (status === 401) {
        setRemaining(res?.attempts_remaining ?? null);
        setError("Invalid credentials. Check your username and password.");
      } else {
        setError(res?.detail || "Something went wrong. Please try again.");
      }
    } finally { setLoading(false); }
  };

  if (locked) return <LockedPanel onTryOther={() => { setLocked(false); setId(""); setPw(""); setError(null); setRemaining(null); }} />;

  return (
    <div className="login-card">
      {error && (
        <div className="login-error">
          <span className="login-error-icon">⚠</span>
          <div>
            <div>{error}</div>
            {remaining !== null && remaining > 0 && (
              <div className="login-error-attempts">
                {remaining} attempt{remaining !== 1 ? "s" : ""} remaining before lockout
              </div>
            )}
            {remaining === 0 && (
              <div className="login-error-attempts" style={{ background: "rgba(220,38,38,0.15)" }}>
                ⚠ Next failed attempt will lock this account
              </div>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="login-field">
          <label className="login-label" htmlFor="uid">Username or Email</label>
          <div className="login-input-wrap">
            <span className="login-input-icon">👤</span>
            <input id="uid" className="login-input" type="text"
              placeholder="Enter your username or email"
              value={id} onChange={e => setId(e.target.value)}
              autoComplete="username" required autoFocus
            />
          </div>
        </div>

        <div className="login-field">
          <label className="login-label" htmlFor="upw">Password</label>
          <div className="login-input-wrap">
            <span className="login-input-icon">🔑</span>
            <input id="upw" className="login-input" type="password"
              placeholder="Enter your password"
              value={pw} onChange={e => setPw(e.target.value)}
              autoComplete="current-password" required
            />
          </div>
        </div>

        <button className="login-btn" type="submit" disabled={loading}>
          {loading ? <><span className="login-btn-spinner" /> Signing in...</> : "Sign In"}
        </button>
      </form>

      <div style={{ textAlign: "center", marginTop: 14 }}>
        <button type="button" onClick={onForgotPassword} style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 12.5, color: "#2563eb", fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif", textDecoration: "underline",
          textUnderlineOffset: 2,
        }}>
          Forgot your password?
        </button>
      </div>

      <div className="login-divider">
        <div className="login-divider-line" />
        <span className="login-divider-text">Access Roles</span>
        <div className="login-divider-line" />
      </div>
      <div className="login-roles">
        <span className="login-role-chip">ADMIN</span>
        <span className="login-role-chip">OPS MANAGER</span>
        <span className="login-role-chip">STAFF</span>
      </div>
    </div>
  );
}

// ── Admin OTP Step ─────────────────────────────────────────────────────────
function OTPStep({ sessionId, maskedEmail, onSuccess, onBack }) {
  const [code,    setCode]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const submit = async (c) => {
    if (!c || c.length !== 6) return;
    setLoading(true); setError(null);
    try {
      const data = await verifyOtpApi(sessionId, c);
      onSuccess(data.access, data.refresh);
    } catch (err) {
      setError(err?.response?.data?.detail || "Incorrect code. Please try again.");
      setCode("");
    } finally { setLoading(false); }
  };

  const handleComplete = (c) => { setCode(c); submit(c); };

  return (
    <div className="login-card">
      <button type="button" onClick={onBack} style={{
        background: "none", border: "none", cursor: "pointer",
        fontSize: 12, color: "#94a0b8", display: "flex", alignItems: "center", gap: 4,
        marginBottom: 16, padding: 0, fontFamily: "'DM Sans', sans-serif",
      }}>← Back</button>

      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{
          width: 52, height: 52, borderRadius: "50%",
          background: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, margin: "0 auto 12px",
          boxShadow: "0 4px 16px rgba(37,99,235,0.35)",
        }}>🔐</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#0d1424", marginBottom: 5 }}>Admin Verification</div>
        <div style={{ fontSize: 12.5, color: "#94a0b8", lineHeight: 1.55 }}>
          Code sent to <strong style={{ color: "#4b5568" }}>{maskedEmail}</strong>
        </div>
      </div>

      {error && <div className="login-error" style={{ marginBottom: 14 }}><span className="login-error-icon">⚠</span>{error}</div>}

      <div style={{ marginBottom: 18 }}><OTPBoxes onComplete={handleComplete} disabled={loading} /></div>

      <button className="login-btn" type="button"
        onClick={() => submit(code)} disabled={loading || code.length !== 6}>
        {loading ? <><span className="login-btn-spinner" /> Verifying...</> : "Verify & Sign In"}
      </button>

      <div style={{ textAlign: "center", marginTop: 12, fontSize: 12, color: "#94a0b8" }}>
        Didn't receive it?{" "}
        <button type="button" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", fontWeight: 600, fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
          Go back and try again
        </button>
      </div>
    </div>
  );
}

// ── Forgot Password — Email Step ───────────────────────────────────────────
function ForgotEmailStep({ onBack, onSent }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handle = async (e) => {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      const data = await forgotPasswordApi(email);
      onSent(data.otp_session_id, email);
    } catch (err) { setError(err?.response?.data?.detail || "Something went wrong."); }
    finally { setLoading(false); }
  };

  return (
    <div className="login-card">
      <button type="button" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#94a0b8", display: "flex", alignItems: "center", gap: 4, marginBottom: 14, padding: 0, fontFamily: "'DM Sans',sans-serif" }}>← Back</button>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#0d1424", marginBottom: 5 }}>Reset Password</div>
        <div style={{ fontSize: 12.5, color: "#94a0b8" }}>Enter your registered email. We'll send a 6-digit code.</div>
      </div>
      {error && <div className="login-error" style={{ marginBottom: 14 }}><span className="login-error-icon">⚠</span>{error}</div>}
      <form onSubmit={handle}>
        <div className="login-field">
          <label className="login-label">Email Address</label>
          <div className="login-input-wrap">
            <span className="login-input-icon">✉</span>
            <input className="login-input" type="email" placeholder="your.email@fairprice.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </div>
        </div>
        <button className="login-btn" type="submit" disabled={loading}>
          {loading ? <><span className="login-btn-spinner" /> Sending...</> : "Send Reset Code"}
        </button>
      </form>
    </div>
  );
}

// ── Forgot Password — OTP + New Password Step ──────────────────────────────
function ForgotOTPStep({ sessionId, email, onBack, onDone }) {
  const [code,    setCode]    = useState("");
  const [newPw,   setNewPw]   = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw,  setShowPw]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const mismatch = confirm.length > 0 && newPw !== confirm;

  const handle = async (e) => {
    e.preventDefault();
    if (mismatch || code.length !== 6) return;
    setLoading(true); setError(null);
    try {
      await resetPasswordConfirmApi(sessionId, code, newPw, confirm);
      onDone();
    } catch (err) { setError(err?.response?.data?.detail || "Reset failed."); }
    finally { setLoading(false); }
  };

  return (
    <div className="login-card">
      <button type="button" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#94a0b8", display: "flex", alignItems: "center", gap: 4, marginBottom: 14, padding: 0, fontFamily: "'DM Sans',sans-serif" }}>← Different email</button>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#0d1424", marginBottom: 4 }}>Create New Password</div>
        <div style={{ fontSize: 12.5, color: "#94a0b8" }}>Code sent to <strong style={{ color: "#4b5568" }}>{email}</strong></div>
      </div>
      {error && <div className="login-error" style={{ marginBottom: 12 }}><span className="login-error-icon">⚠</span>{error}</div>}
      <form onSubmit={handle}>
        <div className="login-field">
          <label className="login-label">Verification Code</label>
          <OTPBoxes onComplete={setCode} disabled={loading} />
        </div>
        <div className="login-field">
          <label className="login-label">New Password</label>
          <div className="login-input-wrap" style={{ position: "relative" }}>
            <span className="login-input-icon">🔑</span>
            <input className="login-input" type={showPw ? "text" : "password"} placeholder="Minimum 8 characters" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={8} style={{ paddingRight: 42 }} />
            <button type="button" onClick={() => setShowPw(p => !p)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#94a0b8" }}>{showPw ? "🙈" : "👁"}</button>
          </div>
        </div>
        <div className="login-field">
          <label className="login-label">Confirm Password</label>
          <div className="login-input-wrap">
            <span className="login-input-icon">🔑</span>
            <input className="login-input" type={showPw ? "text" : "password"} placeholder="Re-enter new password" value={confirm} onChange={e => setConfirm(e.target.value)} required style={{ borderColor: mismatch ? "#dc2626" : undefined }} />
          </div>
          {mismatch && <p style={{ fontSize: 11, color: "#dc2626", marginTop: 3 }}>Passwords do not match.</p>}
        </div>
        <button className="login-btn" type="submit" disabled={loading || mismatch || !newPw || code.length !== 6}
          style={{ background: "linear-gradient(135deg,#16a34a,#15803d)" }}>
          {loading ? <><span className="login-btn-spinner" /> Resetting...</> : "Reset Password"}
        </button>
      </form>
    </div>
  );
}

// ── Reset Done ─────────────────────────────────────────────────────────────
function ResetDone({ onLogin }) {
  return (
    <div className="login-card" style={{ textAlign: "center", padding: "32px 24px" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#0d1424", marginBottom: 8 }}>Password Reset</div>
      <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.65, marginBottom: 20 }}>
        Your password has been updated and your account is now unlocked. Sign in with your new password.
      </p>
      <button className="login-btn" onClick={onLogin}>Sign In Now</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main LoginPage
// ══════════════════════════════════════════════════════════════════════════════
const STEP = { CREDS: "CREDS", OTP: "OTP", FORGOT_EMAIL: "FORGOT_EMAIL", FORGOT_OTP: "FORGOT_OTP", RESET_DONE: "RESET_DONE" };

export default function LoginPage() {
  const [step,         setStep]         = useState(STEP.CREDS);
  const [otpSession,   setOtpSession]   = useState(null);
  const [maskedEmail,  setMaskedEmail]  = useState("");
  const [resetSession, setResetSession] = useState(null);
  const [resetEmail,   setResetEmail]   = useState("");

  const { login, user } = useAuth();
  const navigate         = useNavigate();

  useEffect(() => {
    if (!user) return;
    if      (user.role === "ADMIN")       navigate("/admin/dashboard", { replace: true });
    else if (user.role === "OPS_MANAGER") navigate("/ops/dashboard",   { replace: true });
    else if (user.role === "STAFF")       navigate("/staff/dashboard", { replace: true });
  }, [user, navigate]);

  const headings = {
    [STEP.CREDS]:       { title: "Welcome back",         sub: "Sign in to your SmartGuard account"         },
    [STEP.OTP]:         { title: "Verify your identity", sub: "Admin two-factor authentication required"    },
    [STEP.FORGOT_EMAIL]:{ title: "Forgot password",      sub: "Enter your email to receive a reset code"   },
    [STEP.FORGOT_OTP]:  { title: "Reset password",       sub: "Enter the code and choose a new password"   },
    [STEP.RESET_DONE]:  { title: "All done",             sub: "Your password has been updated successfully" },
  };
  const { title, sub } = headings[step];

  const renderCard = () => {
    switch (step) {
      case STEP.CREDS:
        return <CredentialsStep
          onSuccess={data => {
            if (data.requires_otp) {
              setOtpSession(data.otp_session_id);
              setMaskedEmail(data.detail || "your admin email");
              setStep(STEP.OTP);
            } else {
              login(data.access, data.refresh);
            }
          }}
          onForgotPassword={() => setStep(STEP.FORGOT_EMAIL)}
        />;
      case STEP.OTP:
        return <OTPStep sessionId={otpSession} maskedEmail={maskedEmail}
          onSuccess={async (t, r) => { await login(t, r); }}
          onBack={() => setStep(STEP.CREDS)}
        />;
      case STEP.FORGOT_EMAIL:
        return <ForgotEmailStep onBack={() => setStep(STEP.CREDS)}
          onSent={(sid, em) => { setResetSession(sid); setResetEmail(em); setStep(STEP.FORGOT_OTP); }}
        />;
      case STEP.FORGOT_OTP:
        return <ForgotOTPStep sessionId={resetSession} email={resetEmail}
          onBack={() => setStep(STEP.FORGOT_EMAIL)}
          onDone={() => setStep(STEP.RESET_DONE)}
        />;
      case STEP.RESET_DONE:
        return <ResetDone onLogin={() => setStep(STEP.CREDS)} />;
    }
  };

  return (
    <div className="login-root">
      <div className="login-brand">
        <div className="login-glow-purple" />
        <div className="login-brand-inner">
          <div className="login-logo-row">
            <div className="login-logo-icon">🛡</div>
            <span className="login-logo-text">
              <span className="login-logo-smart">SMART</span>
              <span className="login-logo-guard">GUARD</span>
            </span>
          </div>
          <h2 className="login-headline">
            <span className="hl-white">AI-Powered</span><br />
            <span className="hl-blue">Shoplifting Detection</span><br />
            <span className="hl-white">for Supermarkets</span>
          </h2>
          <p className="login-sub">Real-time behavior analysis, secure evidence handling, and role-based access control — built for FairPrice.</p>
          <div className="login-features">
            {[
              { icon: "AI",   label: "YOLOv5 Detection",  desc: "Concealment, Loitering, Rapid Exit detection" },
              { icon: "2FA",  label: "Two-Factor Auth",   desc: "OTP-secured admin login"                      },
              { icon: "ENC",  label: "Evidence Vault",    desc: "AES-256 encrypted clips"                      },
              { icon: "RBAC", label: "Role-Based Access", desc: "Admin, Ops Manager, Staff"                    },
            ].map(f => (
              <div className="login-feature-pill" key={f.label}>
                <div className="login-feature-icon">{f.icon}</div>
                <div><div className="login-feature-label">{f.label}</div><div className="login-feature-desc">{f.desc}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="login-brand-footer">© 2026 SmartGuard · Made by Techroque · FairPrice Confidential</div>
      </div>

      <div className="login-form-side">
        <div className="login-form-box">
          <div className="login-form-heading">
            <h1 className="login-form-title">{title}</h1>
            <p className="login-form-subtitle">{sub}</p>
          </div>
          {renderCard()}
          <p className="login-footer-note">Access is restricted to authorized FairPrice personnel only.</p>
          <div className="login-secure-badge">🔐 2FA · TLS 1.3 · AES-256 · Audit Logged</div>
        </div>
      </div>
    </div>
  );
}