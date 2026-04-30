// src/api/incidentApi.js

const BASE_URL = "http://localhost:8000";

export async function getIncidents(token, params = {}) {
  const query = new URLSearchParams();
  if (params.status)   query.set("status", params.status);
  if (params.alert_id) query.set("alert_id", params.alert_id);

  const url = `${BASE_URL}/api/incidents/${query.toString() ? "?" + query : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error("Failed to fetch incidents");

  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.results)) return data.results;
  return [];
}

export async function createIncident(token, payload) {
  const res = await fetch(`${BASE_URL}/api/incidents/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create incident report");
  return res.json();
}

export async function updateIncident(token, id, payload) {
  const res = await fetch(`${BASE_URL}/api/incidents/${id}/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update incident report");
  return res.json();
}
