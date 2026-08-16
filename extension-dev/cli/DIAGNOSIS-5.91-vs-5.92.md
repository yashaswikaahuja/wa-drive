# Diagnosis: 5.91 (legacy) fills vs 5.92 (ActionPlan) breaks

**Date:** 2026-08-16  
**Branch:** `debug/cc-cli` (docs/CLI only — product `extension/` not patched)  
**Data:** Live `GET /api/sessions` for Ramishwar workspace  

---

## 1. Evidence table (live)

| Version | Example session | Host | filled / failed | First signal | Record shape |
|---|---|---|---|---|---|
| **5.91** | `8ff0eaef-…` | serviceonline.bihar.gov.in | **18 / 0** | text filled (e.g. application ref) | legacy (`selector`, `actualValue`) |
| **5.91** | `18263fe8-…`, `21b34e4d-…` | (empty host) | **11 / 0** | Full Name = Kamaljeet Kumar | legacy |
| **5.92.0** | `88b999df-…` | fixture govt-form path | **0 / 1** | `failReason=gateway_error`, type=`unknown` | APE (`nodeId`, `stepId`) |
| **5.92.0** | `21822aff-…` | serviceonline.bihar.gov.in | **2 / 1** | also `gateway_error` / type unknown on fails | APE |

### Conclusion A — multi-engine noise

There are many engines **in the tree**, but operator Fill on **5.92** is **one** pipeline (orchestrator → APE → gateway).  
**5.91 sessions are a different engine** (legacy autofill), which still works.

This is a **product-path regression / gap**, not “we don’t know which of 10 engines.”

---

## 2. Where the signal dies (why we can’t see the layer)

### `gateway_error` is a black hole

`extension/runtime/errors.js` / APE:

```text
normalizeFailureCode(unknown) → 'gateway_error'
```

Also **explicit** `gateway_error` when:

1. `CcPerception.resolveExecutionTarget` missing  
2. `CcDomGateway.performAction` or `readAriaState` missing  

Any real low-level error string is **collapsed** before it hits sessions as `failReason`.

### Session `type: unknown`

Product EO → session records set:

```text
type: progress.action_op || 'unknown'
```

5.92 fails show `type=unknown` → fill-session step progress **did not carry `action_op`**, so even “which op failed” is lost.

### No MAIN-world DOM in sessions

Server stores EO claim (`observedValueState` etc.), not an independent page scan.  
Cannot prove “page empty” from sessions alone for the classic P0 lie.

---

## 3. Lab vs extension context

| Run | Context | govt-form + live plan + Kamaljeet |
|---|---|---|
| CLI `fill --fixture govt-form.html` | page-inject of PRODUCT_PATH | **SUCCESS** (e.g. district=Nalanda, DOM ok) |
| Extension **5.92.0** session on same fixture path | chrome.scripting isolated world | **FAIL** `gateway_error` first step |

### Conclusion B — context likely

Shared ActionPlan logic **can** fill the fixture in page context.  
Extension **5.92** fails the same form class with `gateway_error` → prioritize:

1. **Inject incomplete** (globals missing → performAction / resolve missing → explicit gateway_error)  
2. **Isolated-world binding / init order** different from page.evaluate  
3. Less likely: pure type_text logic (lab proves it works)

---

## 4. Layer pin for 5.92 `gateway_error` (best current answer)

```text
AUTH        OK (sessions posted under Ramishwar workspace)
PERCEIVE    OK enough to produce nodes + get a plan (steps exist)
PLAN        OK (server returned steps; lab same)
INJECT/GLOBALS   ← PRIMARY SUSPECT (missing performAction/resolve → gateway_error)
RESOLVE     possible (would often be stale_target if not collapsed)
ACT         possible only if gateway present
POSTCONDITION  post:false on fail row; obs null — failed before/at act
REPORT      records exist but type=unknown, failReason collapsed
```

**One-liner for 5.92 session `88b999df`:**

> Broke at **INJECT/GLOBALS or RESOLVE/ACT entry** on extension **5.92.0** — EO step failed with black-hole **`gateway_error`**, op not recorded (`type=unknown`); lab page-inject of same product scripts **succeeds** on the same fixture.

---

## 5. What NOT to do next

- Do not invent more engines.  
- Do not debug autofill/ for 5.92 Fill-button failures.  
- Do not patch product extension with ad-hoc debug downloads for everyday diagnosis (owner constraint).  

---

## 6. What TO do next (product PR — version-independent)

Minimal observability so the next live session answers the layer:

1. **Stop collapsing** unknown APE errors to bare `gateway_error` without a parallel **diagnostic** code (operator message stays safe; EO `diagnostics[]` already exists).  
2. Always set **`action_op`** on fill-session step progress so records are not `type=unknown`.  
3. Always set **hostname** on session rows (many are empty — hurts host compare).  
4. Optional: one boolean `dom_main_nonempty_count` on session after fill (if product accepts a single MAIN-world scan — product PR, not debug fork).

Then re-run real Fill on 5.92 and read `session --id` — failReason should become specific (`stale_target`, `binding_registry_unavailable`, etc.).

---

## 7. Root-fix candidates (after telemetry or with code review)

| Priority | Hypothesis | Check |
|---|---|---|
| P1 | PRODUCT_PATH inject missing interaction / gateway methods | APE lines 356–357 |
| P1 | Perception not exporting resolveExecutionTarget after inject | APE lines 301–306 |
| P2 | Binding/TOCTOU generation mismatch | APE 361–381 |
| P3 | Portal widget (not native) — less likely for first gateway_error on fixture |

---

## 8. Commands used

```powershell
node extension-dev/cli/cc-debug.mjs sessions --limit 15
node extension-dev/cli/cc-debug.mjs session --id 88b999df-017d-47b1-a6e2-82d1999f69d5
node extension-dev/cli/cc-debug.mjs session --id 18263fe8-de5a-4de1-a27d-74cc5eddff1a
node extension-dev/cli/cc-debug.mjs fill --fixture govt-form.html --profile ...\kamaljeet-kumar.profile.json --headless
```
