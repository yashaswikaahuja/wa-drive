# cc-debug — real operator fill → detailed report → fix gaps

**DEBUG BRANCH ONLY (`debug/cc-cli`). Never merge to master.**

## The right debugging loop

```text
1. Operator logs in (real account) in the extension
2. Operator opens REAL form, picks profile, clicks Fill Form
3. Extension runs real product path + captures a detailed TRACE
4. Trace JSON auto-downloads (cc-fill-trace-*.json)
5. CLI turns trace into a gap report
6. You fix product code using the gaps
```

CLI does **not** need to drive the form. The operator does. CLI only **analyzes**.

---

## Setup (once)

```powershell
cd C:\Users\yasha\.grok\worktrees\yasha-wa-drive\cybercontrol
git checkout debug/cc-cli

# Load unpacked extension from THIS branch:
# chrome://extensions → Developer mode → Load unpacked → select  extension\
```

Login as **Ramishwar** (or any café account) via normal app CONNECT / login so the side panel has `backendUrl` + `accessToken`.

---

## Capture (operator)

1. Open the **real form page** in a tab.  
2. Side panel: select **Kamaljeet Kumar** (or any profile).  
3. Click **Fill Form**.  
4. Browser **downloads** `cc-fill-trace-<timestamp>.json` (usually `Downloads\`).  
5. Status may say “DOM truth failed” if lies were detected — that’s intentional.

Trace includes:

- Page URL / title  
- Perception summary  
- Full ActionPlan + server classification / unmapped counts  
- ExecutionObservation (every step status / failure_code)  
- Binding DOM values after execute  
- **MAIN-world** scan of all inputs (what the page really has)  
- **step_truth** (claim vs DOM)  
- **gaps[]** (PAGE_EMPTY_LIE, STEP_LIE, STEP_FAIL, UNMAPPED_FIELDS)

---

## Report (you / agent)

```powershell
# Newest download automatically:
node extension-dev\cli\cc-debug.mjs report

# Or explicit file:
node extension-dev\cli\cc-debug.mjs report --file $env:USERPROFILE\Downloads\cc-fill-trace-....json
```

Output: console + `extension-dev\cli\out\<run>\report.txt` with:

- Each step: planned value → claim → binding DOM → ok / FAIL / **LIE**  
- PAGE DOM nonempty list  
- GAPS + suggested fix lane (execution vs mapping)

Exit **1** if lies or fails (so you notice).

---

## Fix using the report

| Gap code | Likely layer |
|---|---|
| `PAGE_EMPTY_LIE` / `STEP_LIE` | Executor / gateway / binding / post-fill wipe |
| `STEP_FAIL` | stale_target, postcondition, affordance |
| `UNMAPPED_FIELDS` | Knowledge / fill-planner / scope |
| Zero filled, no lies | Empty plan — wrong page or mapping |

Ship fixes on **product** branches (`phase-3-perception` / master). Keep this debug instrumentation on **`debug/cc-cli`** only (or port carefully).

---

## Secondary: CLI-driven fill (lab)

```powershell
node extension-dev\cli\cc-debug.mjs fill --url "https://..." --profile ... --token ...
```

Useful for fixtures / automation. **Not** a substitute for real operator fill.

---

## Auth reminder

JWT for Ramishwar (24h) was minted earlier; re-mint via gcloud if expired.  
Extension login is preferred for capture (stores token itself).
