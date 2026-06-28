import os, glob

files_to_update = {
    'LoginPage.jsx': 'Login',
    'ConfirmAccountPage.jsx': 'Confirm Account',
    'OpsLivePage.jsx': 'Live Monitoring',
    'StaffDashboard.jsx': 'Staff Alerts',
}

pages_dir = r'C:\Users\asher\OneDrive\Desktop\SmartGuard\smartguard-frontend\src\pages'

for file, title in files_to_update.items():
    filepath = os.path.join(pages_dir, file)
    if not os.path.exists(filepath): continue
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if 'useDocumentTitle' in content: continue
    
    # Insert import
    import_statement = 'import useDocumentTitle from "../utils/useDocumentTitle.js";\n'
    # Find last import
    last_import_idx = content.rfind('import ')
    if last_import_idx != -1:
        end_of_line = content.find('\n', last_import_idx)
        content = content[:end_of_line+1] + import_statement + content[end_of_line+1:]
    else:
        content = import_statement + content
        
    # Find main function
    func_def = f'function {file.split(".")[0]}('
    func_idx = content.find(func_def)
    if func_idx == -1:
        func_def = f'function {file.split(".")[0]}'
        func_idx = content.find(func_def)
    if func_idx == -1:
        func_def = 'export default function '
        func_idx = content.find(func_def)
        
    if func_idx != -1:
        # Find { after function def
        open_brace = content.find('{', func_idx)
        if open_brace != -1:
            hook_call = f'\n  useDocumentTitle("{title}");'
            content = content[:open_brace+1] + hook_call + content[open_brace+1:]
            
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
