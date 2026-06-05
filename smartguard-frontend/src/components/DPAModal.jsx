import React, { useState } from 'react';
import './DPAModal.css';

const DPAModal = ({ onAgree }) => {
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAgree = async () => {
    if (!agreed) return;
    setSubmitting(true);
    await onAgree();
    setSubmitting(false);
  };

  return (
    <div className="dpa-modal-overlay">
      <div className="dpa-modal-content">
        <h2>Data Privacy Agreement</h2>
        <div className="dpa-text-box">
          <p><strong>Privacy Notice & Purpose of Data Collection</strong></p>
          <p>By using the SmartGuard system, you acknowledge and agree that:</p>
          <ul>
            <li>We collect and process video surveillance data and user activity logs solely for the purpose of security monitoring, incident reporting, and operational administration.</li>
            <li>Your personal account information (e.g., name, email, IP address, and login history) is stored to ensure secure access control and system accountability.</li>
          </ul>
          
          <p><strong>Data Retention Policy</strong></p>
          <ul>
            <li>Security video evidence clips are automatically purged after 48 hours unless explicitly saved by an administrator.</li>
            <li>Audit logs and access records are securely retained as long as your account is active, in compliance with standard security frameworks.</li>
          </ul>

          <p><strong>User Rights</strong></p>
          <ul>
            <li>You have the right to access, correct, or request the deletion of your personal account information by contacting the System Administrator.</li>
            <li>You may withdraw your consent at any time; however, doing so will result in the immediate revocation of your access to the SmartGuard system.</li>
          </ul>
        </div>
        
        <div className="dpa-actions">
          <label className="dpa-checkbox-label">
            <input 
              type="checkbox" 
              checked={agreed} 
              onChange={(e) => setAgreed(e.target.checked)} 
            />
            I have read, understood, and agree to the Data Privacy Agreement.
          </label>
          <button 
            className="dpa-submit-btn" 
            disabled={!agreed || submitting} 
            onClick={handleAgree}
          >
            {submitting ? 'Recording Consent...' : 'I Agree & Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DPAModal;
