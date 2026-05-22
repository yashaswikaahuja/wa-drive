@echo off
REM live-logs-windows.bat — Opens 3 separate terminal windows, one per server log
REM Each window tails one PM2 process. Close any window to stop that stream.

echo Opening 3 log windows...
start "HUB - GCP#1 cybercontrol-hub" cmd /k "ssh gcp-worker pm2 logs cybercontrol-hub --raw"
timeout /t 1 /nobreak >nul
start "WA - GCP#2 whatsapp-service" cmd /k "gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command=\"sudo -u kishy pm2 logs whatsapp-service --raw\""
timeout /t 1 /nobreak >nul
start "RESOLVER - GCP#2 whatsapp-resolver" cmd /k "gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command=\"sudo -u kishy pm2 logs whatsapp-resolver --raw\""
echo Done. 3 windows opened.
