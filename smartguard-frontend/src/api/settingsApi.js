// src/api/settingsApi.js

const BASE_URL = "http://localhost:8000";

export async function getSettings(token) {
  const res = await fetch(`${BASE_URL}/api/settings/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

export async function updateSettings(token, data) {
  const res = await fetch(`${BASE_URL}/api/settings/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update settings");
  return res.json();
}
