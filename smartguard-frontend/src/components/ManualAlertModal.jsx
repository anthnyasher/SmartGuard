import React, { useState } from "react";

export default function ManualAlertModal({ isOpen, onClose, onSubmit, cameraId }) {
  const [behaviorType, setBehaviorType] = useState("Suspicious - Manual");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onSubmit(cameraId, behaviorType, notes);
    setIsSubmitting(false);
    setBehaviorType("Suspicious - Manual");
    setNotes("");
    onClose();
  };

  return (
    <div className="sg-modal-overlay">
      <div className="sg-modal-content">
        <h2>🚨 Trigger Manual Alert</h2>
        <p>Manually mark an incident on Camera {cameraId} and start evidence recording.</p>
        
        <form onSubmit={handleSubmit} className="sg-form">
          <div className="sg-form-group">
            <label>Behavior Type</label>
            <select
              value={behaviorType}
              onChange={(e) => setBehaviorType(e.target.value)}
              className="sg-input"
            >
              <option value="Suspicious - Manual">Suspicious</option>
              <option value="Shoplifting - Manual">Shoplifting</option>
              <option value="Loitering - Manual">Loitering</option>
              <option value="Vandalism - Manual">Vandalism</option>
              <option value="Other - Manual">Other</option>
            </select>
          </div>

          <div className="sg-form-group">
            <label>Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="sg-input"
              rows={3}
              placeholder="What did you observe?"
            />
          </div>

          <div className="sg-modal-actions">
            <button type="button" onClick={onClose} className="sg-btn sg-btn-secondary" disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="sg-btn sg-btn-danger" disabled={isSubmitting}>
              {isSubmitting ? "Triggering..." : "Trigger Alert & Record"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
