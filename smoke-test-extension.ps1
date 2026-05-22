# smoke-test-extension.ps1 - Verify extension+profiles flow without opening browser
# Run: powershell -File smoke-test-extension.ps1 -Email "..." -Password "..."

param(
  [Parameter(Mandatory=$true)] [string]$Email,
  [Parameter(Mandatory=$true)] [string]$Password,
  [string]$ApiUrl = "https://api.cybercontrol.fun"
)

function OK   ($m) { Write-Host ('  v ' + $m) -ForegroundColor Green }
function FAIL ($m) { Write-Host ('  X ' + $m) -ForegroundColor Red }

Write-Host "=== Extension Smoke Test ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Login
Write-Host "Step 1: Login..."
try {
  $auth = Invoke-RestMethod -Uri "$ApiUrl/api/auth/login" -Method POST -ContentType "application/json" -Body (@{email=$Email; password=$Password} | ConvertTo-Json) -TimeoutSec 10
  if (-not $auth.accessToken) { FAIL "no token returned"; exit 1 }
  $token = $auth.accessToken
  $wsId = $auth.user.workspaceId
  OK "Logged in as $($auth.user.name) (workspace $($wsId.Substring(0,8))...)"
} catch { FAIL "login failed: $_"; exit 1 }

$headers = @{Authorization = "Bearer $token"}

# Step 2: GET /api/profiles (the endpoint the extension popup uses)
Write-Host ""
Write-Host "Step 2: Fetch profiles (extension popup endpoint)..."
try {
  $profiles = Invoke-RestMethod -Uri "$ApiUrl/api/profiles" -Headers $headers -TimeoutSec 10
  $count = if ($profiles -is [array]) { $profiles.Count } else { 1 }
  if ($count -eq 0) {
    FAIL "0 profiles returned - either no data for this workspace, or endpoint broken"
  } else {
    OK "$count profiles returned"
    foreach ($p in $profiles | Select-Object -First 5) {
      Write-Host ("       - " + $p.name + " (" + $p.phone + ", relationship=" + $p.relationship + ")") -ForegroundColor Gray
    }
    if ($count -gt 5) { Write-Host "       ... and $($count - 5) more" -ForegroundColor Gray }
  }
} catch { FAIL "profiles fetch failed: $_" }

# Step 3: Verify shape (extension expects p.name and p.phone)
Write-Host ""
Write-Host "Step 3: Verify response shape..."
if ($profiles.Count -gt 0) {
  $first = $profiles[0]
  $hasName = $null -ne $first.name
  $hasPhone = $null -ne $first.phone -or $null -ne $first.primary_contact_phone
  $hasId = $null -ne $first.id
  if ($hasName) { OK "profile has 'name' field" } else { FAIL "missing 'name' - extension popup shows 'Unknown'" }
  if ($hasPhone) { OK "profile has 'phone' field" } else { FAIL "missing 'phone' - extension popup search by phone broken" }
  if ($hasId) { OK "profile has 'id' field" } else { FAIL "missing 'id' - autofill won't be able to fetch full profile" }
}

# Step 4: Fetch full profile by id (the autofill endpoint)
Write-Host ""
Write-Host "Step 4: Fetch full profile (autofill endpoint)..."
if ($profiles.Count -gt 0) {
  $id = $profiles[0].id
  try {
    $full = Invoke-RestMethod -Uri "$ApiUrl/api/profiles/$id" -Headers $headers -TimeoutSec 10
    if ($full.data) { OK "GET /api/profiles/:id returns 'data' field for autofill" }
    else { FAIL "no 'data' field - autofill won't have field values" }
  } catch { FAIL "full profile fetch failed: $_" }
}

# Step 5: Workspace isolation check
Write-Host ""
Write-Host "Step 5: Workspace isolation..."
$bogusToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJ3b3Jrc3BhY2VJZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTAwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5fQ.invalid"
try {
  $r = Invoke-WebRequest -Uri "$ApiUrl/api/profiles" -Headers @{Authorization="Bearer $bogusToken"} -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
  FAIL "endpoint accepted invalid JWT (status $($r.StatusCode)) - SECURITY BUG"
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 401) {
    OK "endpoint rejects invalid JWT with 401"
  } else {
    FAIL "unexpected response to invalid JWT: $_"
  }
}

Write-Host ""
Write-Host "=== Smoke test complete ===" -ForegroundColor Cyan
