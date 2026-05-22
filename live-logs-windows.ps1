# live-logs-windows.ps1 — Opens 3 separate PowerShell windows, one per server log
# Usage: powershell -File live-logs-windows.ps1
# Each window tails one PM2 process. Close any window to stop that stream.

Write-Host "Opening 3 log windows..." -ForegroundColor Cyan

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Write-Host 'HUB - GCP#1 cybercontrol-hub' -ForegroundColor Yellow; ssh gcp-worker 'pm2 logs cybercontrol-hub --raw'"
)

Start-Sleep -Seconds 1

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Write-Host 'WA - GCP#2 whatsapp-service' -ForegroundColor Green; gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command='sudo -u kishy pm2 logs whatsapp-service --raw'"
)

Start-Sleep -Seconds 1

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Write-Host 'RESOLVER - GCP#2 whatsapp-resolver' -ForegroundColor Magenta; gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command='sudo -u kishy pm2 logs whatsapp-resolver --raw'"
)

Write-Host "Done. 3 windows opened." -ForegroundColor Cyan
