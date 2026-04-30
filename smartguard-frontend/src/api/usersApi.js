// src/api/usersApi.js

const BASE_URL = "http://localhost:8000";

function authHeaders(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function handleResponse(res) {
  let data = {};
  try { data = await res.json(); } catch { /* 204 No Content */ }
  if (!res.ok) {
    const err    = new Error(data?.detail || "Request failed");
    err.response = { status: res.status, data };
    throw err;
  }
  return data;
}

export async function getUsers(token) {
  return handleResponse(await fetch(`${BASE_URL}/api/users/`, { headers: authHeaders(token) }));
}

export async function createUser(token, data) {
  return handleResponse(await fetch(`${BASE_URL}/api/users/`, {
    method: "POST", headers: authHeaders(token), body: JSON.stringify(data),
  }));
}

export async function updateUser(token, id, data) {
  return handleResponse(await fetch(`${BASE_URL}/api/users/${id}/`, {
    method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
  }));
}

/**
 * DELETE /api/users/<id>/
 * The backend requires the admin's own password in the request body
 * to confirm the destructive action.
 */
export async function deleteUser(token, id, adminPassword = "") {
  const res = await fetch(`${BASE_URL}/api/users/${id}/`, {
    method:  "DELETE",
    headers: authHeaders(token),
    body:    JSON.stringify({ admin_password: adminPassword }),
  });
  if (res.status === 204) return null;
  return handleResponse(res);
}

export async function resetUserPassword(token, id, password, confirmPassword) {
  return handleResponse(await fetch(`${BASE_URL}/api/users/${id}/reset-password/`, {
    method: "POST", headers: authHeaders(token),
    body: JSON.stringify({ password, confirm_password: confirmPassword }),
  }));
}

export async function unlockUser(token, id) {
  return handleResponse(await fetch(`${BASE_URL}/api/users/${id}/unlock/`, {
    method: "POST", headers: authHeaders(token),
  }));
}

export async function toggleUserActive(token, id) {
  return handleResponse(await fetch(`${BASE_URL}/api/users/${id}/toggle-active/`, {
    method: "POST", headers: authHeaders(token),
  }));
}

export function extractApiError(err) {
  const data = err?.response?.data;
  if (!data) return err?.message || "An unexpected error occurred.";
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  const fields = Object.keys(data);
  if (fields.length > 0) {
    const field = fields[0];
    const msgs  = data[field];
    const msg   = Array.isArray(msgs) ? msgs[0] : msgs;
    const label = field === "non_field_errors" ? "" : `${field}: `;
    return `${label}${msg}`;
  }
  return "An unexpected error occurred.";
}