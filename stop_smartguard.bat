@echo off
title SmartGuard AI — Shutdown
color 0C

echo.
echo  ============================================
echo   SmartGuard AI — Stopping all services...
echo  ============================================
echo.

:: ── Step 1: Kill child processes by port ────────────────────────────────────
:: Ensures daphne/waitress die even if window title didn't match
echo  [1/6] Freeing ports 8000 and 8001...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 "') do taskkill /PID %%a /T /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8001 "') do taskkill /PID %%a /T /F >nul 2>&1

:: ── Step 2: Kill Redis by process name ──────────────────────────────────────
echo  [2/6] Stopping Redis...
taskkill /IM "redis-server.exe" /T /F >nul 2>&1

:: ── Step 3: Kill Node (React / Vite dev server) ──────────────────────────────
echo  [3/6] Stopping React (Vite)...
taskkill /IM "node.exe" /T /F >nul 2>&1

:: ── Step 4: Close cmd windows by exact title ────────────────────────────────
:: WINDOWTITLE eq requires EXACT match — wildcards do NOT work with "eq"
echo  [4/6] Closing terminal windows...
taskkill /FI "WINDOWTITLE eq SmartGuard - Redis"            /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq SmartGuard - Daphne"           /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq SmartGuard - Waitress"         /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq SmartGuard - Detection Worker" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq SmartGuard - React"            /T /F >nul 2>&1

:: ── Step 5: Kill any remaining Python processes ──────────────────────────────
echo  [5/6] Cleaning up leftover Python processes...
taskkill /IM "python.exe" /T /F >nul 2>&1

:: ── Step 6: Verify ports are clear ───────────────────────────────────────────
echo  [6/6] Verifying ports are free...
netstat -aon | findstr ":8000 " >nul 2>&1 && echo   WARNING: Port 8000 still in use. || echo   Port 8000 ^— clear.
netstat -aon | findstr ":8001 " >nul 2>&1 && echo   WARNING: Port 8001 still in use. || echo   Port 8001 ^— clear.

echo.
echo  ============================================
echo   All SmartGuard services stopped.
echo  ============================================
echo.
pause >nul