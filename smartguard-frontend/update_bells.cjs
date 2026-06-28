const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'AccessControl.jsx',
  'CameraManagement.jsx',
  'DetectionsPage.jsx',
  'EvidenceVault.jsx',
  'IncidentResponse.jsx',
  'LiveMonitoring.jsx',
  'LogsPage.jsx',
  'SettingsPage.jsx'
];

const basePath = 'C:/Users/asher/OneDrive/Desktop/SmartGuard/smartguard-frontend/src/pages';

filesToUpdate.forEach(file => {
  const filePath = path.join(basePath, file);
  if (!fs.existsSync(filePath)) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (!content.includes('import NotificationBell')) {
    content = content.replace(/import .*?['"].*?['"];\n/, match => match + 'import NotificationBell from "../components/NotificationBell.jsx";\n');
  }
  
  // Replace <div className="sg-topbar-right">...</div> to include <NotificationBell />
  if (content.includes('sg-topbar-right')) {
    if (!content.includes('<NotificationBell />')) {
      content = content.replace(/<div className="sg-topbar-right">/, '<div className="sg-topbar-right">\n              <NotificationBell />');
    }
  } else {
    // Inject sg-topbar-right before </header>
    if (!content.includes('<NotificationBell />')) {
      content = content.replace(/<\/header>/, '  <div className="sg-topbar-right">\n              <NotificationBell />\n            </div>\n          </header>');
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${file}`);
});
