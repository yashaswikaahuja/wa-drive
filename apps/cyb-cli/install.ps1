# Install CyberControl CLI (`cyb`) on Windows
#   irm https://raw.githubusercontent.com/yashaswikaahuja/wa-drive/debug/cc-cli/cyb-cli/install.ps1 | iex
$ErrorActionPreference = "Stop"

$Repo = if ($env:CYB_REPO) { $env:CYB_REPO } else { "https://github.com/yashaswikaahuja/wa-drive.git" }
$Branch = if ($env:CYB_BRANCH) { $env:CYB_BRANCH } else { "debug/cc-cli" }
$Prefix = if ($env:CYB_PREFIX) { $env:CYB_PREFIX } else { Join-Path $env:USERPROFILE ".cybercontrol" }
$BinDir = if ($env:CYB_BIN_DIR) { $env:CYB_BIN_DIR } else { Join-Path $Prefix "bin" }

function Need-Cmd($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Need '$name' on PATH"
  }
}

Need-Cmd node
Need-Cmd npm
Need-Cmd git

$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]").Trim())
if ($nodeMajor -lt 18) { throw "Node.js 18+ required (found $(node -v))" }

Write-Host "==> CyberControl CLI install"
Write-Host "    branch=$Branch  prefix=$Prefix"

New-Item -ItemType Directory -Force -Path $Prefix, $BinDir | Out-Null
$src = Join-Path $Prefix "src"
if (Test-Path $src) { Remove-Item -Recurse -Force $src }

git clone --depth 1 --branch $Branch $Repo $src
if ($LASTEXITCODE -ne 0) { git clone --depth 1 $Repo $src }

$pkg = Join-Path $src "cyb-cli"
if (-not (Test-Path (Join-Path $pkg "package.json"))) {
  throw "cyb-cli/ not found on branch $Branch"
}

$cli = Join-Path $Prefix "cli"
if (Test-Path $cli) { Remove-Item -Recurse -Force $cli }
Copy-Item -Recurse $pkg $cli

# npm link/install globally for current user
npm install -g $cli
if ($LASTEXITCODE -ne 0) { throw "npm install -g failed" }

# Also drop a .cmd shim in Prefix\bin for convenience
$cybJs = Join-Path $cli "bin\cyb.js"
$shim = Join-Path $BinDir "cyb.cmd"
@"
@echo off
node "%~dp0..\cli\bin\cyb.js" %*
"@ | Set-Content -Path $shim -Encoding ASCII

# Fix shim path - use absolute node entry
@"
@echo off
node "$cybJs" %*
"@ | Set-Content -Path $shim -Encoding ASCII

Remove-Item -Recurse -Force $src -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "✓ Installed. Try:"
Write-Host "  cyb version"
Write-Host "  cyb login"
Write-Host "  cyb whoami"
Write-Host "  cyb sessions"
Write-Host ""
Write-Host "If 'cyb' is not found, open a new terminal or add npm global bin to PATH."
npm prefix -g | ForEach-Object { Write-Host "  npm global: $_" }
