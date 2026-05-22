# health-check.ps1 — Windows version of health-check.sh
# Run: powershell -File health-check.ps1
$ErrorActionPreference = 'Continue'
$issues = 0; $warnings = 0

function OK   ($m) { Write-Host ('  v ' + $m) -ForegroundColor Green }
function FAIL ($m) { Write-Host ('  X ' + $m) -ForegroundColor Red; $script:issues++ }
function WARN ($m) { Write-Host ('  ! ' + $m) -ForegroundColor Yellow; $script:warnings++ }

function GCP2 ($cmd) {
  $job = Start-Job -ArgumentList $cmd { param($c) gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command="$c" 2>$null }
  Wait-Job $job -Timeout 20 | Out-Null
  $out = Receive-Job $job
  Remove-Job $job -Force -ErrorAction SilentlyContinue
  return ($out -join "`n")
}

Write-Host "=== CyberControl Health Check ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "--- HUB (GCP#1) ---"
$h = ssh gcp-worker "curl -s http://localhost:3000/api/health" 2>$null
if ($h -match '"status":"ok"') { OK "Hub /api/health" } else { FAIL "Hub /api/health: $h" }

$wa = ssh gcp-worker "cat /opt/cybercontrol-hub/.env" 2>$null
if ($wa -match 'JWT_SECRET=\S+') { OK "Hub JWT_SECRET set" } else { FAIL "Hub JWT_SECRET missing in .env" }
if ($wa -match 'DATABASE_URL=\S+') { OK "Hub DATABASE_URL set" } else { FAIL "Hub DATABASE_URL missing" }

$pm2 = ssh gcp-worker 'pm2 jlist 2>/dev/null | grep -o cybercontrol-hub.*online | head -1' 2>$null
if ($pm2) { OK "Hub PM2 process online" } else { FAIL "Hub PM2 process not online" }

Write-Host ""
Write-Host "--- WORKER (GCP#2) ---"
$wHealth = GCP2 "curl -s http://localhost:3100/health"
$rHealth = GCP2 "curl -s http://localhost:3200/health"
if ($wHealth -match '"status":"ok"') { OK "Worker /health: $wHealth" } else { FAIL "Worker /health: $wHealth" }
if ($rHealth -match '"status":"ok"') { OK "Resolver process /health" } else { FAIL "Resolver process /health: $rHealth" }
if ($rHealth -match '"connected":true') {
  OK "Resolver logged into WhatsApp"
} else {
  WARN "Resolver NOT logged in - saved names won't appear. Scan QR at: http://34.100.147.20:3200/qr-page?secret=wa-service-secret-2024"
}

$pm2Users = (GCP2 "ps -eo user,stat,args | grep 'PM2.*God' | grep -v grep | awk '`$2 !~ /Z/ {print `$1}' | sort -u").Trim()
if ($pm2Users -eq 'kishy') { OK "Single PM2 daemon (kishy)" }
elseif ($pm2Users -eq '') { FAIL "No PM2 daemon running on GCP#2!" }
else { FAIL "PM2 daemons: '$pm2Users' - only kishy should run" }

$sessOwn = (GCP2 "stat -c %U /opt/whatsapp/service/sessions").Trim()
if ($sessOwn -eq 'kishy') { OK "service/sessions/ owned by kishy" }
else { FAIL "service/sessions/ owned by '$sessOwn' - run: sudo chown -R kishy:kishy /opt/whatsapp/service/sessions" }

$resolvOwn = (GCP2 "stat -c %U /opt/whatsapp/resolver/session 2>/dev/null").Trim()
if ($resolvOwn -eq 'kishy') { OK "resolver/session/ owned by kishy" }
else { WARN "resolver/session/ owned by '$resolvOwn'" }

$p3100 = (GCP2 "sudo ss -tulpn 2>/dev/null | grep ':3100 ' | wc -l").Trim()
$p3200 = (GCP2 "sudo ss -tulpn 2>/dev/null | grep ':3200 ' | wc -l").Trim()
if ($p3100 -eq '1') { OK "Port 3100 - single listener" } else { FAIL "Port 3100 listeners: $p3100" }
if ($p3200 -eq '1') { OK "Port 3200 - single listener" } else { FAIL "Port 3200 listeners: $p3200" }

$orphans = (GCP2 "ps aux | grep -E 'chrome.*resolver/session' | grep -v grep | awk '{print `$1}' | sort -u | grep -v kishy | wc -l").Trim()
if ($orphans -eq '0') { OK "No orphan Chrome processes" }
else { FAIL "$orphans orphan Chrome process(es) - run: bash recover-resolver.sh" }

$refErrs = (GCP2 "sudo -u kishy pm2 logs whatsapp-service --nostream --lines 200 --err 2>/dev/null | grep -c ReferenceError").Trim()
if ([int]$refErrs -lt 1) { OK "No recent ReferenceError in worker" }
else { WARN "$refErrs ReferenceError(s) in worker logs - redeploy whatsapp-service/index.js" }

Write-Host ""
Write-Host "--- EXTENSION SERVICE (GCP#1, port 3300) ---"
$extHealth = ssh gcp-worker "curl -s http://localhost:3300/health" 2>$null
if ($extHealth -match '"status":"ok"') { OK "extension-service /health" }
else { FAIL "extension-service /health: $extHealth" }

$extPm2 = ssh gcp-worker 'pm2 jlist 2>/dev/null | grep -o extension-service.*online | head -1' 2>$null
if ($extPm2) { OK "extension-service PM2 process online" }
else { FAIL "extension-service PM2 process not online" }

# Verify nginx routes /api/profiles to port 3300 not hub
$nginxConf = ssh gcp-worker "sudo cat /etc/nginx/sites-enabled/cybercontrol 2>/dev/null | grep -A1 'location /api/profiles' | head -2" 2>$null
if ($nginxConf -match '127\.0\.0\.1:3300') { OK "nginx routes /api/profiles -> :3300 (extension-service)" }
else { FAIL "nginx /api/profiles not routed to :3300 - extension will hit the hub instead" }

# Verify extension-service shares JWT_SECRET with hub
$hubJwt = (ssh gcp-worker "grep ^JWT_SECRET= /opt/cybercontrol-hub/.env 2>/dev/null | head -c 25").Trim()
$extJwt = (ssh gcp-worker "grep ^JWT_SECRET= /opt/extension-service/.env 2>/dev/null | head -c 25").Trim()
if ($hubJwt -and $hubJwt -eq $extJwt) { OK "JWT_SECRET matches between hub and extension-service" }
else { FAIL "JWT_SECRET mismatch - extension will reject hub-issued tokens" }

Write-Host ""
Write-Host "--- FRONTEND ---"
try {
  $fe = (Invoke-WebRequest "https://app.cybercontrol.fun/" -UseBasicParsing -TimeoutSec 10).StatusCode
  if ($fe -eq 200) { OK "https://app.cybercontrol.fun/ -> 200" } else { FAIL "Frontend returned $fe" }
} catch { FAIL "Frontend unreachable: $_" }

try {
  $api = (Invoke-WebRequest "https://api.cybercontrol.fun/api/health" -UseBasicParsing -TimeoutSec 10).Content
  if ($api -match '"status":"ok"') { OK "https://api.cybercontrol.fun/api/health" }
  else { FAIL "API health: $api" }
} catch { FAIL "API unreachable: $_" }

Write-Host ""
if ($issues -eq 0 -and $warnings -eq 0) {
  Write-Host "All systems healthy" -ForegroundColor Green
  exit 0
} elseif ($issues -eq 0) {
  Write-Host "$warnings warning(s). System functional." -ForegroundColor Yellow
  exit 0
} else {
  Write-Host "$issues issue(s), $warnings warning(s). See OPERATIONS.md." -ForegroundColor Red
  exit 1
}
