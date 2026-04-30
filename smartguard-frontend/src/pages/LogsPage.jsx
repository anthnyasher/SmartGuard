// src/pages/LogsPage.jsx
// Real-time audit log viewer that fetches from GET /api/logs/
// FRS 4.A: categorized, filterable, exportable logs per user session

import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import "./AdminDashboard.css";
import "./shared-components.css";
import "./LogsPage.css";

const BASE_URL = "http://localhost:8000";

const NAV_ITEMS = [
  { id: "dashboard",  label: "Dashboard",          icon: "⊞", path: "/admin"            },
  { id: "live",       label: "Live Monitoring",     icon: "◉", path: "/admin/live"       },
  { id: "detections", label: "Detections & Alerts", icon: "✦", path: "/admin/detections" },
  { id: "evidence",   label: "Evidence Vault",      icon: "🔒", path: "/admin/evidence"   },
  { id: "cameras",    label: "Cameras",             icon: "📷", path: "/admin/cameras"    },
  { id: "logs",       label: "Logs",                icon: "📋", path: "/admin/logs"       },
  { id: "access",     label: "Access Control",      icon: "🔑", path: "/admin/access"     },
  { id: "settings",   label: "Settings",            icon: "⚙",  path: "/admin/settings"   },
];

const CATEGORIES = [
  { id: "ALL",          label: "All Logs",          icon: "📋" },
  { id: "OPERATIONAL",  label: "Operational",       icon: "⚙"  },
  { id: "USER_ACTIVITY",label: "User Activity",     icon: "👤" },
  { id: "DETECTION",    label: "Alert & Detection", icon: "✦"  },
  { id: "SECURITY",     label: "Security Threats",  icon: "🛡"  },
  { id: "AUDIT",        label: "Audit",             icon: "📝" },
];

// Maps action codes → security-relevant display data
const LEVEL_CSS = {
  CRITICAL: "log-level--critical",
  HIGH:     "log-level--high",
  MEDIUM:   "log-level--medium",
  WARNING:  "log-level--warning",
  INFO:     "log-level--info",
};

const CATEGORY_CSS = {
  SECURITY:      "log-cat-badge--security",
  USER_ACTIVITY: "log-cat-badge--user",
  DETECTION:     "log-cat-badge--detection",
  OPERATIONAL:   "log-cat-badge--operational",
  AUDIT:         "log-cat-badge--audit",
};

function formatTimestamp(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function LogsPage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  // ── State ──────────────────────────────────────────────────────────────────
  const [logs,       setLogs]       = useState([]);
  const [summary,    setSummary]    = useState({});
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [pages,      setPages]      = useState(1);
  const [autoRefresh,setAutoRefresh]= useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [category,         setCategory]         = useState("ALL");
  const [levelFilter,      setLevelFilter]       = useState("ALL");
  const [search,           setSearch]            = useState("");
  const [searchInput,      setSearchInput]       = useState(""); // debounced

  // ── Debounce search ─────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Fetch logs from real API ────────────────────────────────────────────────
  const fetchLogs = useCallback(async (showSpinner = true) => {
    if (!token) return;
    if (showSpinner) setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      page:      page,
      page_size: 60,
    });
    if (category !== "ALL")      params.set("category", category);
    if (levelFilter !== "ALL")   params.set("level",    levelFilter);
    if (search)                  params.set("search",   search);

    try {
      const res = await fetch(`${BASE_URL}/api/logs/?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setLogs(data.results ?? []);
      setTotal(data.count  ?? 0);
      setPages(data.pages  ?? 1);
      setSummary(data.summary ?? {});
    } catch (err) {
      setError(err.message || "Failed to load logs.");
    } finally {
      setLoading(false);
    }
  }, [token, page, category, levelFilter, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Auto-refresh every 15 s when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => fetchLogs(false), 15_000);
    return () => clearInterval(t);
  }, [autoRefresh, fetchLogs]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [category, levelFilter]);

  const handleLogout = () => { logout(); navigate("/login", { replace: true }); };

  // ── CSV export ──────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!logs.length) return;
    const header = "ID,Timestamp,Level,Category,Action,Message,Username,IP,Device\n";
    const rows   = logs.map(l =>
      [l.id, l.timestamp, l.level, l.category, l.action,
       `"${(l.message || "").replace(/"/g, "'")}"`,
       l.username, l.ip_address || "", `"${l.device_info || ""}"`
      ].join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `smartguard-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const catCount = (catId) => {
    if (catId === "ALL") return summary.total ?? total;
    const key = catId.toLowerCase().replace("user_activity", "user");
    return summary[key] ?? 0;
  };

  const hasSecurityAlerts = (summary.security ?? 0) > 0;

  return (
    <div className="sg-layout">
      {/* ── Sidebar ── */}
      <aside className={`sg-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sg-sidebar-logo">
          <div className="sg-logo-icon">🛡</div>
          {!sidebarCollapsed && (
            <span className="sg-logo-text">
              <span className="sg-logo-smart">SMART</span>
              <span className="sg-logo-guard">GUARD</span>
            </span>
          )}
        </div>
        <nav className="sg-sidebar-nav">
          {NAV_ITEMS.map(item => (
            <Link key={item.id} to={item.path}
              className={`sg-nav-item${item.id === "logs" ? " sg-nav-active" : ""}`}>
              <span className="sg-nav-icon">{item.icon}</span>
              {!sidebarCollapsed && <span className="sg-nav-label">{item.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="sg-sidebar-footer">
          <div className="sg-user-row">
            <div className="sg-user-avatar">{user?.email?.[0]?.toUpperCase() || "A"}</div>
            {!sidebarCollapsed && (
              <div className="sg-user-info">
                <div className="sg-user-name">{user?.email}</div>
                <div className="sg-user-role">{user?.role}</div>
              </div>
            )}
          </div>
          {!sidebarCollapsed && <button className="sg-logout-btn" onClick={handleLogout}>Logout</button>}
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="sg-main">
        <header className="sg-topbar">
          <div className="sg-topbar-left">
            <button className="sg-collapse-btn" onClick={() => setSidebarCollapsed(p => !p)}>☰</button>
            <div className="sg-breadcrumb">
              <span className="sg-breadcrumb-root">Dashboard</span>
              <span className="sg-breadcrumb-sep">›</span>
              <span className="sg-breadcrumb-current">System Logs</span>
            </div>
          </div>
          <div className="sg-topbar-right">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(p => !p)}
              style={{
                padding: "6px 12px", fontSize: 11, fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                background: autoRefresh ? "rgba(22,163,74,0.08)" : "var(--bg-surface)",
                color: autoRefresh ? "var(--accent-green)" : "var(--text-muted)",
                cursor: "pointer", transition: "all 0.14s",
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: autoRefresh ? "var(--accent-green)" : "var(--border)",
                display: "inline-block",
                animation: autoRefresh ? "sg-spin 2s linear infinite" : "none",
              }} />
              {autoRefresh ? "Live" : "Auto-refresh"}
            </button>
            <button className="sg-pdf-btn" onClick={handleExport} disabled={!logs.length}>
              ↓ Export CSV
            </button>
          </div>
        </header>

        <div className="sg-content">
          <h1 className="sg-page-title">System Logs</h1>

          {/* KPI strip */}
          <div className="sg-kpi-strip" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 20 }}>
            {[
              { label: "Total Entries",    val: summary.total ?? total,             icon: "📋", cls: "kpi-blue",   iconCls: "kpi-icon-blue"  },
              { label: "Security Threats", val: summary.security ?? 0,             icon: "🛡", cls: "kpi-red",    iconCls: "kpi-icon-red"   },
              { label: "Critical Events",  val: summary.critical ?? 0,             icon: "🚨", cls: "kpi-amber",  iconCls: "kpi-icon-amber" },
              { label: "High Events",      val: summary.high ?? 0,                 icon: "⚠",  cls: "kpi-purple", iconCls: "kpi-icon-purple"},
            ].map(k => (
              <div key={k.label} className={`sg-kpi ${k.cls}`}>
                <div className={`sg-kpi-icon-wrap ${k.iconCls}`}>{k.icon}</div>
                <div>
                  <div className="sg-kpi-val">{loading ? "—" : k.val}</div>
                  <div className="sg-kpi-label">{k.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Security alert banner */}
          {!loading && hasSecurityAlerts && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", marginBottom: 16,
              background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)",
              borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--accent-red)", fontWeight: 500,
            }}>
              <span>🛡</span>
              <span>
                {summary.security} security event{summary.security !== 1 ? "s" : ""} logged.
                Check the <strong>Security Threats</strong> category for details.
              </span>
            </div>
          )}

          <div className="log-layout">
            {/* Category sidebar */}
            <div className="log-categories">
              {CATEGORIES.map(cat => (
                <button key={cat.id}
                  className={`log-cat-btn${category === cat.id ? " log-cat-btn--active" : ""}`}
                  onClick={() => setCategory(cat.id)}>
                  <span className="log-cat-icon">{cat.icon}</span>
                  <span className="log-cat-label">{cat.label}</span>
                  <span className="log-cat-count">{loading ? "…" : catCount(cat.id)}</span>
                  {cat.id === "SECURITY" && hasSecurityAlerts && (
                    <span className="log-cat-alert-dot" />
                  )}
                </button>
              ))}
            </div>

            {/* Log table */}
            <div className="sg-card log-table-card">
              {/* Filters */}
              <div className="log-table-filters">
                <div className="det-search-wrap" style={{ flex: 1 }}>
                  <span className="det-search-icon">🔍</span>
                  <input className="det-search"
                    placeholder="Search messages, username, IP, or device..."
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                  />
                  {searchInput && (
                    <button onClick={() => { setSearchInput(""); setSearch(""); }}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-muted)", padding: "0 4px" }}>✕</button>
                  )}
                </div>
                <select className="det-select" value={levelFilter} onChange={e => setLevelFilter(e.target.value)}>
                  {["ALL", "CRITICAL", "HIGH", "MEDIUM", "WARNING", "INFO"].map(l => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
                <button
                  onClick={() => fetchLogs()}
                  style={{
                    padding: "5px 10px", fontSize: 11, fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif",
                    border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                    background: "var(--bg-base)", color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  ↻
                </button>
              </div>

              {/* Log entries */}
              <div className="log-entries">
                {loading ? (
                  <div className="sg-loading" style={{ padding: "24px 16px" }}>
                    <div className="sg-spinner" /> Loading logs…
                  </div>
                ) : error ? (
                  <div className="sg-empty" style={{ color: "var(--accent-red)", padding: "24px" }}>
                    ⚠ {error}
                    <button onClick={fetchLogs} className="det-btn det-btn--view" style={{ marginLeft: 8 }}>
                      Retry
                    </button>
                  </div>
                ) : logs.length === 0 ? (
                  <div className="sg-empty" style={{ padding: "40px 24px" }}>
                    {search ? `No logs match "${search}".` : "No log entries for these filters."}
                  </div>
                ) : logs.map(log => (
                  <div key={log.id}
                    className={`log-entry log-entry--${(log.category || "").toLowerCase()}`}>

                    {/* Left: time + source + level */}
                    <div className="log-entry-left">
                      <span className={`log-level ${LEVEL_CSS[log.level] || "log-level--info"}`}>
                        {log.level}
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "flex-end" }}>
                        <span className="log-time">{formatTimestamp(log.timestamp)}</span>
                        <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                          {formatDate(log.timestamp)}
                        </span>
                        <span className="log-source">{log.source}</span>
                      </div>
                    </div>

                    {/* Middle: message */}
                    <div className="log-entry-message">
                      {log.message}
                    </div>

                    {/* Right: ip + user + device + category */}
                    <div className="log-entry-right">
                      {log.ip_address && <span className="log-ip">{log.ip_address}</span>}
                      {log.username   && <span className="log-user">@{log.username}</span>}
                      {log.device_info && (
                        <span style={{
                          fontSize: 9, color: "var(--text-muted)",
                          maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis",
                          whiteSpace: "nowrap", textAlign: "right",
                        }}>
                          {log.device_info}
                        </span>
                      )}
                      <span className={`log-cat-badge ${CATEGORY_CSS[log.category] || ""}`}>
                        {(log.category || "").replace("_", " ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination footer */}
              <div className="det-table-footer" style={{ padding: "10px 16px", flexWrap: "wrap", gap: 8 }}>
                <span className="det-count-label">
                  Page {page} of {pages} · {total} total entries
                </span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    style={{
                      padding: "3px 10px", fontSize: 11, fontWeight: 600,
                      border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                      background: "var(--bg-base)", color: page <= 1 ? "var(--text-muted)" : "var(--accent-blue)",
                      cursor: page <= 1 ? "not-allowed" : "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    ← Prev
                  </button>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Space Mono', monospace" }}>
                    {page}/{pages}
                  </span>
                  <button
                    disabled={page >= pages}
                    onClick={() => setPage(p => p + 1)}
                    style={{
                      padding: "3px 10px", fontSize: 11, fontWeight: 600,
                      border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                      background: "var(--bg-base)", color: page >= pages ? "var(--text-muted)" : "var(--accent-blue)",
                      cursor: page >= pages ? "not-allowed" : "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Next →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}