const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export async function getAlerts(token) {
  const res = await fetch(`${BASE_URL}/api/alerts/`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch alerts");
  }

  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.results)) return data.results;
  return [];
}

export async function acknowledgeAlert(token, alertId, notes = "") {
  const res = await fetch(`${BASE_URL}/api/alerts/${alertId}/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      acknowledged: true,
      notes,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to acknowledge alert");
  }

  return await res.json();
}

export async function getAnalytics(token) {
  const res = await fetch(`${BASE_URL}/api/alerts/analytics/`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch analytics");
  }

  return await res.json();
}

export async function triggerAlarm(token, alertId) {
  const res = await fetch(`${BASE_URL}/api/alerts/${alertId}/trigger-alarm/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to trigger alarm");
  }

  return await res.json();
}

export async function getWeeklyReport(token) {
  const res = await fetch(`${BASE_URL}/api/reports/weekly/`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch weekly report");
  }

  return await res.json();
}

export async function createManualAlert(token, camera_id, behavior_type, notes) {
  const res = await fetch(`${BASE_URL}/api/alerts/manual-override/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ camera_id, behavior_type, notes }),
  });

  if (!res.ok) {
    throw new Error("Failed to trigger manual alert");
  }

  return await res.json();
}
