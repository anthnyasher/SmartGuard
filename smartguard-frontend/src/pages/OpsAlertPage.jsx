import { useState } from "react";
import OpsLayout from "./Opslayout.jsx";
import useDocumentTitle from "../utils/useDocumentTitle.js";
import AlertsManager from "./AlertsManager.jsx";

export default function OpsAlertPage() {
  useDocumentTitle("My Alerts");
  const [collapsed, setCollapsed] = useState(window.innerWidth <= 768);

  const topbarRight = (
    <div className="sg-topbar-right">
      <button className="sg-btn sg-btn--outline">âš™ Configure Alerts</button>
    </div>
  );

  return (
    <OpsLayout active="alerts" title="My Alerts"
      subtitle="Alerts for cameras and zones assigned to your account"
      topbarRight={topbarRight}
      sidebarCollapsed={collapsed}
      onToggleSidebar={() => setCollapsed(p => !p)}
    >
      <AlertsManager />
    </OpsLayout>
  );
}
