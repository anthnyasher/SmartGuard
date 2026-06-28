import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAlerts } from '../api/alertApi.js';
import { getIncidents } from '../api/incidentApi.js';
import { getLogs } from '../api/settingsApi.js';
import { formatBehavior } from '../utils/behavior.js';

export default function NotificationBell() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [accessRequests, setAccessRequests] = useState([]);
  const [notificationFeed, setNotificationFeed] = useState([]);
  const [now, setNow] = useState(Date.now());
  const dropdownRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!token || user?.role === 'STAFF') return;

    async function loadFeedData() {
      try {
        const alertsPromise = getAlerts(token).catch(() => []);
        const incPromise = getIncidents(token).catch(() => []);
        const logsPromise = user?.role === 'ADMIN' ? getLogs(token).catch(() => []) : Promise.resolve([]);
        
        const [alerts, incData, logData] = await Promise.all([
          alertsPromise, incPromise, logsPromise
        ]);
        const alertList = Array.isArray(alerts) ? alerts : [];
        const incList   = Array.isArray(incData) ? incData : (Array.isArray(incData?.results) ? incData.results : []);
        const logList   = Array.isArray(logData) ? logData : (Array.isArray(logData?.results) ? logData.results : []);

        const feed = [];
        
        alertList.slice(0, 20).forEach(a => {
          feed.push({
            id: `alert-${a.id}`, type: "ALERT",
            title: `${formatBehavior(a.behavior_type)} Detected`,
            desc: `Camera ${a.camera_name || a.camera_id} - ${a.camera_location || 'Unknown'} - Zone: ${a.zone_name || 'N/A'}${a.notes ? ' | Notes: ' + a.notes : ''}`,
            timestamp: new Date(a.created_at),
            url: "/admin/detections"
          });
        });

        incList.slice(0, 20).forEach(i => {
          feed.push({
            id: `inc-${i.id}`, type: "INCIDENT",
            title: i.status === "OPEN" ? "Incident Report Created" : `Incident ${i.status}`,
            desc: `Camera ${i.camera_name} - ${formatBehavior(i.behavior_type)}`,
            timestamp: new Date(i.created_at),
            url: "/admin/incidents"
          });
        });

        logList.slice(0, 30).forEach(l => {
          if (["ALERT_FALSE_POS", "ALERT_ESCALATED", "ALERT_REVIEWED"].includes(l.action)) {
            feed.push({
              id: `log-${l.id}`, type: "AUDIT",
              title: l.action === "ALERT_FALSE_POS" ? "Marked as False Positive" : (l.action === "ALERT_ESCALATED" ? "Alert Escalated" : "Alert Reviewed"),
              desc: l.message,
              timestamp: new Date(l.timestamp),
              url: "/admin/logs"
            });
          }
        });

        feed.sort((a, b) => b.timestamp - a.timestamp);
        setNotificationFeed(feed.slice(0, 10));
      } catch (err) {
        console.error("Failed to load feed", err);
      }
    }
    
      async function loadAccessRequests() {
        try {
          const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || "https://smartguard.54.206.184.54.nip.io"}/api/cameras/access-requests/`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const incoming = await res.json();
            setAccessRequests(prev => {
              const nonPending = prev.filter(r => r.status !== 'PENDING');
              const merged = [...incoming, ...nonPending];
              return merged.sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));
            });
          }
        } catch (e) {
          console.error("Failed to load access requests", e);
        }
      }

    loadFeedData();
    loadAccessRequests();
    const int = setInterval(loadAccessRequests, 10000);
    return () => clearInterval(int);
  }, [token, user]);

  const handleRespond = async (e, id, action) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || "https://smartguard.54.206.184.54.nip.io"}/api/cameras/access-requests/${id}/${action}/`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }
      });
        if (res.ok) {
          const newStatus = action === 'approve' ? 'APPROVED' : 'DENIED';
          setAccessRequests(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
        }
    } catch (e) { console.error(e); }
  };

  const renderTimer = (requestedAtStr) => {
    const requestedAt = new Date(requestedAtStr).getTime();
    const diff = (5 * 60 * 1000) - (now - requestedAt);
    if (diff <= 0) return "Request timed out";
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  if (user?.role === 'STAFF') return null;

  const pendingRequests = accessRequests.filter(r => {
    const reqTime = new Date(r.requested_at).getTime();
    return (now - reqTime) < 5 * 60 * 1000 && !['APPROVED', 'DENIED', 'EXPIRED'].includes(r.status);
  });

  const totalNotifications = notificationFeed.length + pendingRequests.length;

  return (
    <div className="sg-notifications-wrapper" ref={dropdownRef}>
      <button className="sg-icon-btn" title="Notifications" onClick={() => setShowNotifications(p => !p)}>
        🔔{totalNotifications > 0 && <span className="sg-icon-badge">{totalNotifications}</span>}
      </button>
      {showNotifications && (
        <div className="sg-notifications-dropdown">
          <div className="sg-notif-header">
            <h4>Activity Feed</h4>
            {totalNotifications > 0 && <span className="sg-notif-count">{totalNotifications} New</span>}
          </div>
          <div className="sg-notif-body">
            {totalNotifications === 0 ? (
              <div className="sg-notif-empty">No recent activity</div>
            ) : (
              <>
                {accessRequests.map(req => {
                  const reqTime = new Date(req.requested_at).getTime();
                  const isTimedOut = (now - reqTime) >= 5 * 60 * 1000;
                  
                  let statusLabel = null;
                  if (req.status === 'APPROVED') statusLabel = <span style={{color: '#10b981', fontSize: '12px', fontWeight: 600}}>Approved</span>;
                  else if (req.status === 'DENIED') statusLabel = <span style={{color: '#ef4444', fontSize: '12px', fontWeight: 600}}>Denied</span>;
                  else if (req.status === 'EXPIRED' || isTimedOut) statusLabel = <span style={{color: '#6b7280', fontSize: '12px'}}>Request timed out</span>;

                  return (
                    <div key={`req-${req.id}`} className="sg-notif-item">
                      <div className="sg-notif-icon" style={{background: 'rgba(16, 185, 129, 0.1)', color: '#10b981'}}>🛡</div>
                      <div className="sg-notif-content" style={{flex: 1}}>
                          <p className="sg-notif-title">{req.staff_name} requests access</p>
                          <p className="sg-notif-desc">System-wide Access</p>
                          <span className="sg-notif-time">
                          {!statusLabel ? renderTimer(req.requested_at) : new Date(req.requested_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      {!statusLabel ? (
                        <div style={{display: 'flex', gap: '4px'}}>
                          <button onClick={(e) => handleRespond(e, req.id, 'approve')} style={{background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer'}}>✓</button>
                          <button onClick={(e) => handleRespond(e, req.id, 'deny')} style={{background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer'}}>✕</button>
                        </div>
                      ) : (
                        <div>{statusLabel}</div>
                      )}
                    </div>
                  );
                })}

                {notificationFeed.map(item => (
                  <div key={item.id} className="sg-notif-item" onClick={() => { setShowNotifications(false); navigate(item.url); }}>
                    <div className="sg-notif-icon" style={{
                      background: item.type === 'ALERT' ? 'rgba(239, 68, 68, 0.1)' : (item.type === 'INCIDENT' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)'),
                      color: item.type === 'ALERT' ? '#ef4444' : (item.type === 'INCIDENT' ? '#3b82f6' : '#f59e0b')
                    }}>
                      {item.type === 'ALERT' ? '🚨' : (item.type === 'INCIDENT' ? '📄' : '🛡')}
                    </div>
                    <div className="sg-notif-content">
                      <p className="sg-notif-title">{item.title}</p>
                      <p className="sg-notif-desc">{item.desc}</p>
                      <span className="sg-notif-time">{item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="sg-notif-footer" onClick={() => { setShowNotifications(false); navigate("/admin/logs"); }}>
            View Full Audit Log
          </div>
        </div>
      )}
    </div>
  );
}
