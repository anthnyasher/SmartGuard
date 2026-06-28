import { useEffect, useState } from "react";
import { getWeeklyReport } from "../api/alertApi.js";
import { useAuth } from "../context/AuthContext.jsx";
import "./WeeklyReportModal.css";

export default function WeeklyReportModal({ onClose }) {
  const { token } = useAuth();
  const [reportData, setReportData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchReport() {
      try {
        const data = await getWeeklyReport(token);
        setReportData(data);
      } catch (err) {
        console.error(err);
        setError("Failed to generate report.");
      }
    }
    if (token) fetchReport();
  }, [token]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="wrm-overlay" onClick={onClose}>
      <div className="wrm-modal" onClick={e => e.stopPropagation()}>
        <div className="wrm-header-actions no-print">
          <h2 className="wrm-modal-title">Export Report</h2>
          <div className="wrm-btn-group">
            <button className="wrm-btn wrm-btn-ghost" onClick={onClose}>Cancel</button>
            <button className="wrm-btn wrm-btn-ghost" onClick={handlePrint}>🖨 Print</button>
            <button className="wrm-btn wrm-btn-primary" onClick={() => { alert('Please select "Save as PDF" in the Print dialog.'); handlePrint(); }}>📥 Download PDF</button>
          </div>
        </div>

        <div className="wrm-content" id="printable-report">
          {error && <div className="wrm-error">{error}</div>}
          {!reportData && !error && <div className="wrm-loading">Generating Report Data...</div>}

          {reportData && (
            <div className="wrm-report-document">
              <header className="wrm-doc-header">
                <div className="wrm-doc-logo">SMARTGUARD</div>
                <h1 className="wrm-doc-title">Weekly Statistics Report</h1>
                <p className="wrm-doc-period">
                  <strong>Period:</strong> {new Date(reportData.date_range.start).toLocaleDateString()} to {new Date(reportData.date_range.end).toLocaleDateString()}
                </p>
              </header>

              <section className="wrm-section">
                <h2>Executive Summary</h2>
                <div className="wrm-stats-grid">
                  <div className="wrm-stat-box">
                    <span className="wrm-stat-icon">🚨</span>
                    <div className="wrm-stat-info">
                      <h3>Total Alerts</h3>
                      <div className="wrm-stat-val">{reportData.alerts.this_week}</div>
                      <div className="wrm-stat-sub">Last week: {reportData.alerts.last_week}</div>
                    </div>
                  </div>
                  <div className="wrm-stat-box">
                    <span className="wrm-stat-icon">📹</span>
                    <div className="wrm-stat-info">
                      <h3>New Evidence Clips</h3>
                      <div className="wrm-stat-val">{reportData.evidence.this_week}</div>
                      <div className="wrm-stat-sub">Last week: {reportData.evidence.last_week}</div>
                    </div>
                  </div>
                  <div className="wrm-stat-box">
                    <span className="wrm-stat-icon">📝</span>
                    <div className="wrm-stat-info">
                      <h3>Incidents Logged</h3>
                      <div className="wrm-stat-val">{reportData.incidents.this_week}</div>
                      <div className="wrm-stat-sub">Last week: {reportData.incidents.last_week}</div>
                    </div>
                  </div>
                </div>
              </section>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <section className="wrm-section" style={{ marginTop: '20px' }}>
                  <h2>Top Cameras (Detections)</h2>
                  <div className="wrm-table-wrapper">
                    <table className="wrm-table">
                      <thead>
                        <tr>
                          <th>Camera Name</th>
                          <th>Alerts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.alerts.top_cameras.length === 0 ? (
                          <tr><td colSpan="2" className="wrm-table-empty">No detections this week</td></tr>
                        ) : (
                          reportData.alerts.top_cameras.map(c => (
                            <tr key={c.camera}>
                              <td style={{fontWeight: 'bold'}}>{c.camera}</td>
                              <td>{c.count}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="wrm-section" style={{ marginTop: '20px' }}>
                  <h2>Behavior Breakdown</h2>
                  <div className="wrm-table-wrapper">
                    <table className="wrm-table">
                      <thead>
                        <tr>
                          <th>Behavior Type</th>
                          <th>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(reportData.alerts.behavior_breakdown).length === 0 ? (
                          <tr><td colSpan="2" className="wrm-table-empty">No behaviors detected</td></tr>
                        ) : (
                          Object.entries(reportData.alerts.behavior_breakdown).map(([beh, count]) => (
                            <tr key={beh}>
                              <td>{beh}</td>
                              <td>{count}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              <section className="wrm-section">
                <h2>Alert Resolution Status</h2>
                <div className="wrm-table-wrapper">
                  <table className="wrm-table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(reportData.alerts.status_breakdown).length === 0 ? (
                        <tr><td colSpan="2" className="wrm-table-empty">No status changes this week</td></tr>
                      ) : (
                        Object.entries(reportData.alerts.status_breakdown).map(([stat, count]) => (
                          <tr key={stat}>
                            <td><span className={`wrm-status-badge stat-${stat.toLowerCase()}`}>{stat}</span></td>
                            <td>{count}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <footer className="wrm-doc-footer">
                <p>Generated by SmartGuard AI Detection System</p>
                <p>{new Date().toLocaleString()}</p>
              </footer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}