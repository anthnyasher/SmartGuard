// src/api/evidenceApi.js

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export async function getEvidence(token, params = {}) {
  const query = new URLSearchParams();
  if (params.severity)      query.set("severity", params.severity);
  if (params.alert_status)  query.set("alert_status", params.alert_status);
  if (params.review_status) query.set("review_status", params.review_status);
  if (params.search)        query.set("search", params.search);

  const url = `${BASE_URL}/api/evidence/${query.toString() ? "?" + query : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error("Failed to fetch evidence");

  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.results)) return data.results;
  return [];
}

export async function getEvidenceDetail(token, id) {
  const res = await fetch(`${BASE_URL}/api/evidence/${id}/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch evidence detail");
  return res.json();
}

export async function verifyEvidence(token, id) {
  const res = await fetch(`${BASE_URL}/api/evidence/${id}/verify/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error("Failed to verify evidence");
  return res.json();
}

export async function reviewEvidence(token, id, reviewStatus) {
  const res = await fetch(`${BASE_URL}/api/evidence/${id}/review/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ review_status: reviewStatus }),
  });
  if (!res.ok) throw new Error("Failed to review evidence");
  return res.json();
}

export async function getEvidenceStats(token) {
  const res = await fetch(`${BASE_URL}/api/evidence/stats/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch evidence stats");
  return res.json();
}

export function getEvidenceDownloadUrl(id, token) {
  return `${BASE_URL}/api/evidence/${id}/download/?token=${encodeURIComponent(token)}`;
}
