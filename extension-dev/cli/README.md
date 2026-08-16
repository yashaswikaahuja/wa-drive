# cc-debug — **live** operator fill reports (no product extension edits)

**Branch:** `debug/cc-cli` only · **Never merge to master**  
**Rule:** Do **not** modify `extension/*` for debugging. Product stays version-independent.

---

## What you asked for

| Want | How |
|---|---|
| Authenticate real account | Use normal extension login (or JWT for API) |
| Operator fills real form | Real extension, real UI, real page |
| Record live what happened | Server already receives fill-plan / fill-observation / sessions |
| Detailed report | CLI reads **live API** and prints gaps |
| Fix from report | Product PRs on product branches |

CLI does **not** drive Fill and does **not** patch the extension.

---

## Setup

```powershell
cd C:\Users\yasha\.grok\worktrees\yasha-wa-drive\cybercontrol
git checkout debug/cc-cli
git pull origin debug/cc-cli

$env:CC_BACKEND_URL = "https://api.cybercontrol.fun/api"
$env:CC_ACCESS_TOKEN = (Get-Content extension-dev\cli\out\ramishwar-access.jwt -Raw).Trim()
# or paste a fresh JWT after login
```

---

## Live record (primary)

**Terminal A — leave running:**

```powershell
node extension-dev\cli\cc-debug.mjs live
```

**Operator (any Chrome with the shipped / product extension):**

1. Login as Ramishwar (or any café user)  
2. Open real form  
3. Select profile (e.g. Kamaljeet Kumar)  
4. Click **Fill Form**

**Terminal A** prints a new session report as soon as the server gets it, and writes:

```text
extension-dev/cli/out/live-session-<uuid>/report.txt
extension-dev/cli/out/live-session-<uuid>/session.json
```

---

## One-shot commands

```powershell
# list recent fills for this workspace
node extension-dev\cli\cc-debug.mjs sessions

# one fill in detail
node extension-dev\cli\cc-debug.mjs session --id <session-uuid>
```

---

## What is in the live report

From the **server session** the real extension posted:

- hostname / form key / runtime version  
- total filled / failed  
- per-field **records** (step result, failure codes, observed_value_state when present)

**Honest limitation (product gap, not CLI):**  
Sessions do not always include MAIN-world “page empty” proof. If the UI said filled and the page was empty, the report will still show what the **server was told**. That gap is a product bug to fix (DOM truth in EO/session) — and the live session data is what proves the mismatch between operator experience and reported totals.

---

## Lab only (optional)

`fill --url ...` still exists for offline experiments. It is **not** the live operator path.

---

## Never do this

- Edit `extension/application/fill-orchestrator.js` for debug  
- Edit `popup.js` / `background.js` for debug  
- Merge `debug/cc-cli` into master  

All debug code stays under **`extension-dev/cli/`**.
