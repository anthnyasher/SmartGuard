import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getConfirmationDetails, submitConfirmation } from "../api/authApi";
const showToast = (msg, type) => alert(`[${type.toUpperCase()}] ${msg}`);
import sgLogo from "../assets/smartguard-logo.png";
import useDocumentTitle from "../utils/useDocumentTitle.js";

export default function ConfirmAccountPage() {
  useDocumentTitle("Confirm Account");
  const { token } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState(null);
  const [error, setError] = useState(null);
  
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function fetchDetails() {
      try {
        const data = await getConfirmationDetails(token);
        setDetails(data);
      } catch (err) {
        setError(err?.response?.data?.detail || "Invalid or expired confirmation link.");
      } finally {
        setLoading(false);
      }
    }
    fetchDetails();
  }, [token]);

  const handleAction = async (action) => {
    setSubmitting(true);
    try {
      const res = await submitConfirmation(token, action);
      showToast(res.detail || (action === "confirm" ? "Account confirmed!" : "Registration cancelled"), "success");
      navigate("/login", { replace: true });
    } catch (err) {
      showToast(err?.response?.data?.detail || `Failed to ${action} account`, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.loadingText}>Loading details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <img src={sgLogo} alt="SmartGuard" style={styles.logo} />
          <h2 style={styles.title}>Confirmation Error</h2>
          <div style={styles.errorBox}>
            <span style={{ marginRight: 8 }}>⚠</span>{error}
          </div>
          <button style={styles.primaryButton} onClick={() => navigate("/login")}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src={sgLogo} alt="SmartGuard" style={styles.logo} />
        <h2 style={styles.title}>Welcome to SmartGuard</h2>
        <p style={styles.subtitle}>An administrator has invited you to join the system. Please verify your details below.</p>
        
        <div style={styles.detailsContainer}>
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Name:</span>
            <span style={styles.detailValue}>{(details.first_name || details.last_name) ? `${details.first_name} ${details.last_name}` : "-"}</span>
          </div>
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Username:</span>
            <span style={styles.detailValue}>{details.username}</span>
          </div>
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Email:</span>
            <span style={styles.detailValue}>{details.email}</span>
          </div>
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Role:</span>
            <span style={styles.detailValue}>{details.role}</span>
          </div>
        </div>

        <div style={styles.buttonContainer}>
          <button 
            style={styles.primaryButton} 
            onClick={() => handleAction("confirm")}
            disabled={submitting}
          >
            {submitting ? "Processing..." : "Confirm & Activate Account"}
          </button>
          <button 
            style={styles.ghostButton} 
            onClick={() => handleAction("cancel")}
            disabled={submitting}
          >
            Cancel Registration
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    padding: "20px",
    fontFamily: "'DM Sans', sans-serif"
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "40px",
    width: "100%",
    maxWidth: "480px",
    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)",
    textAlign: "center"
  },
  logo: {
    width: "60px",
    marginBottom: "24px"
  },
  title: {
    margin: "0 0 12px 0",
    fontSize: "24px",
    fontWeight: "700",
    color: "#0f172a"
  },
  subtitle: {
    margin: "0 0 32px 0",
    fontSize: "15px",
    color: "#64748b",
    lineHeight: "1.5"
  },
  detailsContainer: {
    backgroundColor: "#f1f5f9",
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "32px",
    textAlign: "left"
  },
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "12px",
    paddingBottom: "12px",
    borderBottom: "1px solid #e2e8f0",
  },
  detailLabel: {
    fontWeight: "600",
    color: "#475569",
    fontSize: "14px"
  },
  detailValue: {
    color: "#0f172a",
    fontSize: "14px",
    fontWeight: "500"
  },
  buttonContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  },
  primaryButton: {
    backgroundColor: "#10b981",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    padding: "14px 24px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background-color 0.2s"
  },
  ghostButton: {
    backgroundColor: "transparent",
    color: "#ef4444",
    border: "1px solid #fee2e2",
    borderRadius: "8px",
    padding: "14px 24px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background-color 0.2s"
  },
  loadingText: {
    color: "#64748b",
    fontSize: "16px"
  },
  errorBox: {
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    padding: "16px",
    borderRadius: "8px",
    marginBottom: "24px",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  }
};