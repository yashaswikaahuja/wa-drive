@echo off
echo 🚀 Starting CyberControl Frontend (connects to live GCP backend)
echo.

cd /d "%~dp0frontend"

echo VITE_API_URL=https://api.cybercontrol.fun/api> .env
echo VITE_SOCKET_URL=https://api.cybercontrol.fun>> .env

echo Installing dependencies...
call npm install >nul 2>&1

echo.
echo 🌐 Frontend starting at http://localhost:5173
echo    Backend: https://api.cybercontrol.fun (live GCP)
echo    Login with your existing account
echo.
call npx vite --host
