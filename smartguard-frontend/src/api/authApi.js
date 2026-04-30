// src/api/authApi.js

const BASE_URL = "http://localhost:8000";

// ── Login ─────────────────────────────────────────────────────────────────────
export async function loginApi(identifier, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login/`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ username: identifier, password }),
  });

  let data = {};
  try { data = await res.json(); } catch { /* empty */ }

  if (!res.ok) {
    const err    = new Error(data?.detail || "Login failed");
    err.response = { status: res.status, data };
    throw err;
  }
  return data; // { requires_otp, otp_session_id } OR { access, refresh }
}

// ── Admin 2FA OTP ─────────────────────────────────────────────────────────────
export async function verifyOtpApi(otpSessionId, otpCode) {
  const res = await fetch(`${BASE_URL}/api/auth/verify-otp/`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ otp_session_id: otpSessionId, otp_code: otpCode }),
  });

  let data = {};
  try { data = await res.json(); } catch { /* empty */ }

  if (!res.ok) {
    const err    = new Error(data?.detail || "Verification failed");
    err.response = { status: res.status, data };
    throw err;
  }
  return data; // { access, refresh }
}

// ── Forgot password ───────────────────────────────────────────────────────────
export async function forgotPasswordApi(email) {
  const res = await fetch(`${BASE_URL}/api/auth/forgot-password/`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email }),
  });

  let data = {};
  try { data = await res.json(); } catch { /* empty */ }

  if (!res.ok) {
    const err    = new Error(data?.detail || "Request failed");
    err.response = { status: res.status, data };
    throw err;
  }
  return data; // { detail, otp_session_id }
}

// ── Reset password confirm ────────────────────────────────────────────────────
export async function resetPasswordConfirmApi(otpSessionId, otpCode, newPassword, confirmPassword) {
  const res = await fetch(`${BASE_URL}/api/auth/reset-password-confirm/`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      otp_session_id:   otpSessionId,
      otp_code:         otpCode,
      new_password:     newPassword,
      confirm_password: confirmPassword,
    }),
  });

  let data = {};
  try { data = await res.json(); } catch { /* empty */ }

  if (!res.ok) {
    const err    = new Error(data?.detail || "Reset failed");
    err.response = { status: res.status, data };
    throw err;
  }
  return data; // { detail }
}

// ── Me ────────────────────────────────────────────────────────────────────────
export async function getMe(token) {
  const res = await fetch(`${BASE_URL}/api/auth/me/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err    = new Error("Unauthorized");
    err.response = { status: res.status, data: {} };
    throw err;
  }
  return res.json();
}

// ── Token refresh ─────────────────────────────────────────────────────────────
export async function refreshTokenApi(refreshToken) {
  const res = await fetch(`${BASE_URL}/api/auth/refresh/`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ refresh: refreshToken }),
  });
  if (!res.ok) {
    const err    = new Error("Token refresh failed");
    err.response = { status: res.status, data: {} };
    throw err;
  }
  return res.json();
}