# Debug findings (cc-debug on `debug/cc-cli`)

**Date:** 2026-08-16  
**SHA:** product code at branch tip when CLI was cut (+ CLI commits)  
**Issues:** #211, #213  

---

## Session 1 — Offline CLI baseline

### What we ran

```bash
node extension-dev/cli/cc-debug.mjs fill-e2e --fixture perception-native.html --max-steps 2
node extension-dev/cli/cc-debug.mjs fill-e2e --fixture cascade-select.html --max-steps 2
node extension-dev/cli/cc-debug.mjs fill-e2e --fixture perception-native.html --max-steps 1 --force-lie
```

### Results

| Scenario | EO | Binding truth | Main-world scan | Exit |
|---|---|---|---|---|
| Offline native text | completed / succeeded | DOM matches DEBUG_VALUE_* | nonempty | 0 |
| Offline cascade text | completed / succeeded | pass | nonempty | 0 |
| `--force-lie` | fake completed | **violation** (empty DOM) | empty | 1 |

**Conclusion A:** In **page/same-context** inject (like CI APE harness), product path **does write DOM** and truth gate works.

---

## Session 1 — Isolated-world write probe

CDP `Page.createIsolatedWorld` + set `input.value` → **main world sees the value**.

```json
{ "isolatedWritesReachMain": true, "mainWorldValue": "ISO_VALUE" }
```

**Conclusion B:** Chrome isolated world **can** mutate page DOM.  
Issue #213 analysis that “isolated world cannot change page DOM” is **incorrect** as a root-cause theory.

---

## What that means for P0 #213

Report said:

- Side panel: **18 filled, 0 failed** (18 fill-plan turns)
- After: **all inputs empty** (agent-browser main-world scan)
- CI green / in-page executor works

On **this tree’s** `fill-orchestrator.js`, product Fill is a **single** perceive→plan→execute cycle — **no 18-turn loop** in popup/orchestrator. So either:

1. The 18-turn deploy was a **different build** (adaptive multi-turn not on this tip), or  
2. Something else (service retries / another client) issued 18 plans.

Regardless, if EO status is `succeeded` with `observed_value_state: nonempty`, the executor **believed** `element.value` was nonempty **after** `performAction` in its world. For native inputs that should stick in the page.

### Remaining root-cause hypotheses (ordered)

1. **Reporting lie without real execute** — UI/session counts inflated (e.g. counting plan steps or multi-turn aggregates) while DOM never written.  
2. **Wrong tab / wrong frame** — fill ran on a different document than the one agent-browser scanned.  
3. **Values set then wiped** — navigation, form reset, SPA re-render after EO.  
4. **Stale / wrong bindings** — rare; postcondition would usually fail if element empty (unless postcondition skipped).  
5. **Non-native widgets** — not the cascade-select plain inputs case.  
6. **Deploy ≠ this source tip** — master zip / old build behavior.

### What offline CLI cannot reproduce yet

Full **Chrome extension** path: `chrome.scripting.executeScript` from popup + live backend multi-turn.  
Next debug steps:

1. `fill-e2e` with main-world scan (added) — always cross-check page emptiness.  
2. Extension-load mode (Playwright + unpacked extension) against fixture + local service.  
3. Capture one real session JSON (`GET /api/sessions/:id`) and compare EO steps vs DOM.  
4. Confirm whether multi-turn adaptive loop exists on the **deployed** build.

---

## Practical next commands

```bash
# baseline still green?
node extension-dev/cli/cc-debug.mjs fill-e2e --fixture cascade-select.html --max-steps 3

# prove truth gate
node extension-dev/cli/cc-debug.mjs fill-e2e --fixture cascade-select.html --max-steps 1 --force-lie

# isolated write physics
node extension-dev/cli/lib/isolated-probe.mjs
```
