// src/api/cameraApi.js
const BASE_URL = "http://localhost:8000";

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function handleResponse(res) {
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data?.detail || data?.message || "Request failed");
    err.response = { status: res.status, data };
    throw err;
  }
  return data;
}

// ── READ ───────────────────────────────────────────────────────────────────────

export async function getCameras(token) {
  const res = await fetch(`${BASE_URL}/api/cameras/`, {
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

export async function getCamera(token, id) {
  const res = await fetch(`${BASE_URL}/api/cameras/${id}/`, {
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

// ── CREATE ─────────────────────────────────────────────────────────────────────

export async function createCamera(token, data) {
  const res = await fetch(`${BASE_URL}/api/cameras/`, {
    method:  "POST",
    headers: authHeaders(token),
    body:    JSON.stringify(data),
  });
  return handleResponse(res);
}

// ── UPDATE ─────────────────────────────────────────────────────────────────────

export async function updateCamera(token, id, data) {
  const res = await fetch(`${BASE_URL}/api/cameras/${id}/`, {
    method:  "PATCH",           // PATCH = partial update (only changed fields)
    headers: authHeaders(token),
    body:    JSON.stringify(data),
  });
  return handleResponse(res);
}

// ── DELETE ─────────────────────────────────────────────────────────────────────

export async function deleteCamera(token, id) {
  const res = await fetch(`${BASE_URL}/api/cameras/${id}/`, {
    method:  "DELETE",
    headers: authHeaders(token),
  });
  if (res.status === 204) return null; // 204 No Content = success, no body
  return handleResponse(res);
}