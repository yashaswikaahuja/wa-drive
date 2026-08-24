# CyberControl CLI (`cyb`)

Operator CLI for CyberControl — **browser login**, session list, live fill watch, per-field timing.

## Install

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/yashaswikaahuja/wa-drive/debug/cc-cli/cyb-cli/install.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/yashaswikaahuja/wa-drive/debug/cc-cli/cyb-cli/install.ps1 | iex
```

### From this repo (dev)

```bash
cd cyb-cli
npm install -g .
# or
node bin/cyb.js --help
```

Requires **Node.js 18+**.

---

## Quick start

```bash
cyb login          # opens browser → sign in → terminal saves JWT
cyb whoami
cyb sessions
cyb session <uuid>
cyb live           # WSS field-by-field fill stream (same workspace JWT as extension)
cyb logout
```

**Auth note:** `cyb login` mints a JWT over **HTTPS**. `cyb live` then watches **WSS** `fill_live` events. Extension login works the same way — HTTPS token, then WSS presence/fill/debug. See `docs/REPO-MAP.md`.

### Login modes

| Command | Behavior |
|---------|----------|
| `cyb login` | **Device flow** — opens browser to API authorize page (like `gh auth login` / Grok CLI) |
| `cyb login --email you@cafe.com` | Password in terminal (no browser) |
| `cyb login --token eyJ…` | Paste access JWT |

Credentials (default):

- **Windows:** `%APPDATA%\cybercontrol\credentials.json`
- **macOS/Linux:** `~/.config/cybercontrol/credentials.json`

---

## Commands

```
cyb login | logout | whoami | status
cyb sessions [--limit 20]
cyb session <id>
cyb live [--poll-ms 3000]
cyb version | help
```

Global:

```
--api https://api.cybercontrol.fun/api
--token <jwt>     # one-shot for a command
```

---

## How browser login works

```
cyb login
   │
   ├─ POST /api/auth/cli/device     → device_code + user_code
   ├─ open browser → GET /api/auth/cli/authorize?user_code=ABCD-1234
   │                    user enters email + password
   │                    POST authorize → marks device approved + mints JWT
   ├─ poll GET /api/auth/cli/poll?device_code=…
   └─ save accessToken + refreshToken to credentials.json
```

**Backend requirement:** API must include `/api/auth/cli/*` (added in this branch).  
Until that is deployed to production, use:

```bash
cyb login --email …
# or
cyb login --token …
```

---

## Notes

- Does **not** patch the Chrome extension.
- Sessions appear after the extension finishes a fill and posts observation (batched).
- Access JWT ~24h; run `cyb login` again when `whoami` fails.
