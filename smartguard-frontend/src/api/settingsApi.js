// src/api/settingsApi.js

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://smartguard.54.206.184.54.nip.io";

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

export async function getSystemHealth(token) {
  const res = await fetch(`${BASE_URL}/api/system/health/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch system health");
  return res.json();
}

export async function getFailedLoginsCount(token) {
  const res = await fetch(`${BASE_URL}/api/logs/failed_logins/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch failed logins");
  return res.json();
}

export async function getBackupHistory(token) {
  const res = await fetch(`${BASE_URL}/api/backup/history/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch backup history");
  return res.json();
}

export async function triggerBackup(token) {
  const res = await fetch(`${BASE_URL}/api/backup/trigger/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to trigger backup");
  return res.json();
}

export async function restoreBackup(token, backupId) {
  const res = await fetch(`${BASE_URL}/api/backup/restore/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ id: backupId }),
  });
  if (!res.ok) throw new Error("Failed to restore backup");
  return res.json();
}

export async function getLogs(token, params = {}) {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.action) query.set("action", params.action);
  if (params.page_size) query.set("page_size", params.page_size);

  const url = `${BASE_URL}/api/logs/${query.toString() ? "?" + query : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch logs");
  
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}
