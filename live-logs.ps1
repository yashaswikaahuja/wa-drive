# live-logs.ps1 — Tail all CyberControl server logs in one terminal
# Usage: powershell -File live-logs.ps1
# Stop: Ctrl+C

$ErrorActionPreference = "Continue"

Write-Host "=== CyberControl Live Logs ===" -ForegroundColor Cyan
Write-Host "[HUB]    GCP#1 cybercontrol-hub" -ForegroundColor Yellow
Write-Host "[WA]     GCP#2 whatsapp-service" -ForegroundColor Green
Write-Host "[RESOLV] GCP#2 whatsapp-resolver" -ForegroundColor Magenta
Write-Host "Press Ctrl+C to stop`n" -ForegroundColor Gray

# Background jobs for each tail
$hubJob = Start-Job -ScriptBlock {
    ssh gcp-worker "pm2 logs cybercontrol-hub --raw --lines 0" 2>&1
}
$waJob = Start-Job -ScriptBlock {
    gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command="pm2 logs whatsapp-service --raw --lines 0" 2>&1
}
$resolverJob = Start-Job -ScriptBlock {
    gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command="pm2 logs whatsapp-resolver --raw --lines 0" 2>&1
}

# Stream output from all jobs with colored prefix
try {
    while ($true) {
        $hubOut = Receive-Job -Job $hubJob -Keep:$false
        if ($hubOut) {
            $hubOut | ForEach-Object {
                if ($_) { Write-Host "[HUB]    " -ForegroundColor Yellow -NoNewline; Write-Host $_ }
            }
        }
        $waOut = Receive-Job -Job $waJob -Keep:$false
        if ($waOut) {
            $waOut | ForEach-Object {
                if ($_) { Write-Host "[WA]     " -ForegroundColor Green -NoNewline; Write-Host $_ }
            }
        }
        $resolverOut = Receive-Job -Job $resolverJob -Keep:$false
        if ($resolverOut) {
            $resolverOut | ForEach-Object {
                if ($_) { Write-Host "[RESOLV] " -ForegroundColor Magenta -NoNewline; Write-Host $_ }
            }
        }
        Start-Sleep -Milliseconds 300
    }
} finally {
    Stop-Job $hubJob, $waJob, $resolverJob -ErrorAction SilentlyContinue
    Remove-Job $hubJob, $waJob, $resolverJob -Force -ErrorAction SilentlyContinue
    Write-Host "`nStopped." -ForegroundColor Cyan
}
