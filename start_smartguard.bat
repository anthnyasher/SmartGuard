@echo off
title SmartGuard AI — Launcher
color 0A
echo.
echo  ============================================
echo   SmartGuard AI — Starting all services...
echo  ============================================
echo.

:: ── Base path ────────────────────────────────────────────────────────────────
set "SG_ROOT=c:\Users\asher\OneDrive\Desktop\SmartGuard"

:: ── Terminal 1: Redis ────────────────────────────────────────────────────────
echo  [1/5] Checking Redis...
netstat -ano | findstr ":6379" >nul
if %errorlevel% equ 0 (
    echo  [+] Redis is already running on port 6379. Skipping startup.
) else (
    echo  [+] Starting Redis...
    start "SmartGuard — Redis" cmd /k "title SmartGuard - Redis && redis-server"
)
timeout /t 2 /nobreak >nul

:: ── Terminal 2: Daphne (Django ASGI — port 8000) ─────────────────────────────
echo  [2/5] Starting Daphne...
start "SmartGuard — Daphne" cmd /k "title SmartGuard - Daphne && cd /d %SG_ROOT% && call .venv\Scripts\activate.bat && cd smartguard_backend && daphne -p 8000 smartguard_backend.asgi:application"
timeout /t 2 /nobreak >nul

:: ── Terminal 3: Waitress (MJPEG stream — port 8001) ──────────────────────────
echo  [3/5] Starting Waitress...
start "SmartGuard — Waitress" cmd /k "title SmartGuard - Waitress && cd /d %SG_ROOT% && call .venv\Scripts\activate.bat && cd smartguard_backend && waitress-serve --port=8001 --threads=16 smartguard_backend.wsgi:application"
timeout /t 2 /nobreak >nul

:: ── Terminal 4: Detection Worker ─────────────────────────────────────────────
echo  [4/5] Starting Detection Worker...
start "SmartGuard — Worker" cmd /k "title SmartGuard - Detection Worker && cd /d %SG_ROOT% && call .venv\Scripts\activate.bat && cd smartguard_backend && python detection_worker.py"
timeout /t 2 /nobreak >nul

:: ── Terminal 5: React Frontend ────────────────────────────────────────────────
echo  [5/5] Starting React frontend...
start "SmartGuard — React" cmd /k "title SmartGuard - React && cd /d %SG_ROOT%\smartguard-frontend && npm run dev"

echo.
echo  ============================================
echo   All services started!
echo.
echo   Redis       → port 6379
echo   Daphne      → port 8000  (API + WebSockets)
echo   Waitress    → port 8001  (camera streams)
echo   Worker      → AI detection
echo   React       → port 5173
echo  ============================================
echo.
pause >nul