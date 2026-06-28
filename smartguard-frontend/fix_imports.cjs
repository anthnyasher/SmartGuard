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
    content = 'import NotificationBell from "../components/NotificationBell.jsx";\n' + content;
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});
