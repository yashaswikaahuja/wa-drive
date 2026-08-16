# cc-debug — fill a **real form** and see what happened

**DEBUG BRANCH ONLY (`debug/cc-cli`). Never merge to master.**

This is **not** a test runner. It is a CLI to:

1. Open a **real form URL**
2. Run the **product fill path** (perceive → server `/fill-plan` → ActionPlan execute)
3. Print a **fill report**: what was planned, what claimed ok/fail, what the **DOM** shows
4. Save artifacts for deep inspection

---

## Setup (once)

```bash
git checkout debug/cc-cli
cd extension-dev/tests/browser && npm install && cd ../../..
```

Chrome must be installed (or set `CHROME_PATH`).

---

## Primary command: `fill`

```bash
node extension-dev/cli/cc-debug.mjs fill ^
  --url "https://your-portal.example/application" ^
  --profile .\my-profile.json ^
  --backend-url https://api.your-host/api ^
  --token YOUR_JWT
```

### Env alternatives

```powershell
$env:CC_BACKEND_URL = "https://api.your-host/api"
$env:CC_ACCESS_TOKEN = "YOUR_JWT"

node extension-dev/cli/cc-debug.mjs fill --url "https://..." --profile .\my-profile.json
```

### Profile JSON

Either flat:

```json
{
  "full_name": "Ravi Kumar",
  "email": "ravi@example.com",
  "mobile": "9876543210"
}
```

Or extension-shaped:

```json
{
  "id": "profile-uuid",
  "name": "Ravi",
  "data": {
    "full_name": "Ravi Kumar",
    "email": "ravi@example.com"
  }
}
```

### Useful flags

| Flag | Meaning |
|---|---|
| `--headed` | Show browser (default for `fill`) |
| `--headless` | Hide browser |
| `--keep-open` | Leave browser open ~90s after report |
| `--execution-preference AUTO\|STATIC\|DYNAMIC` | Same as side panel mode |
| `--out <dir>` | Custom artifact folder |

### Example report (console + `report.txt`)

```text
═══════════════════════════════════════════════════════════
  CC-DEBUG FILL REPORT  (real form / product path)
═══════════════════════════════════════════════════════════
URL       https://portal.../form
Perceive  nodes=42  revision=1
Plan      steps=8  plan_id=plan:...
───────────────────────────────────────────────────────────
   1  ok    type_text     node:...
      planned "Ravi Kumar"  dom="Ravi Kumar"  → DOM ok
   2  fail  select_option node:...
      planned ...  dom="(empty)"  → LIE (claimed ok, select empty)
RESULT    ok=1  fail=1  skip=0  lies=1
PAGE DOM  nonempty_controls=1/12
═══════════════════════════════════════════════════════════
```

### Artifacts

```text
extension-dev/cli/out/<run-id>/
  report.txt              ← start here
  report.json
  snapshot.json           Page IR
  plan.json               ActionPlan from server
  fill-plan-response.json raw server body
  execution.json          ExecutionObservation
  dom-after.json          values via binding registry
  main-world-after.json   all inputs/selects on page
  truth.json
  meta.json
```

Exit **0** only if no failed steps and no DOM lies.

---

## Other commands

```bash
node extension-dev/cli/cc-debug.mjs status
node extension-dev/cli/cc-debug.mjs perceive --url "https://..."
node extension-dev/cli/cc-debug.mjs fill-e2e --fixture perception-native.html   # lab only
```

---

## Important limitations

| | |
|---|---|
| **What runs** | Product scripts injected into the page (same modules as extension inject list) + real `/fill-plan` |
| **Not yet** | Driving the real side-panel UI / full MV3 service-worker path reliably |
| **Never** | Merge this branch to `master` |

If server mapping returns **0 steps**, the report will say so — that is a **brain/mapping** issue, not executor.

---

## Sync product code into this branch

```bash
git checkout debug/cc-cli
git merge phase-3-perception   # or rebase — product → debug only
# never: merge debug/cc-cli into master
```
