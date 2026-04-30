const BASE_URL = "http://localhost:8000";

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
