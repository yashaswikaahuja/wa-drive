# autofill/executor

Sequential fill kernel. Injected into web pages as a single bundle.

## Structure

```
autofill/
├── executor.js                  ← Facade. Entry point: fillFormFieldsSequential()
├── executor-bundle.js           ← AUTO-GENERATED. Do not edit. Injected into pages.
├── build-executor-bundle.mjs    ← Build script. Run: node build-executor-bundle.mjs
└── executor/
    └── capabilities/
        ├── Cc*.js               ← Pure capability modules (21 files)
        ├── Cc*.test.mjs         ← Tests (plain Node .mjs, no framework)
        ├── Cc*.md               ← Documentation
        ├── install-*.js         ← Kernel wiring installers (20 files)
        └── install-*.md         ← Documentation
```

## Naming convention

| Prefix | Role |
|--------|------|
| `Cc*` | Pure capability — sets `globalThis.CcXxx`, no kernel dependency, fully testable |
| `install-*` | Kernel wiring — calls `CcExecParts.installXxx(k)`, picks up `CcXxx` globals and wires them onto the kernel object `k` |

## Bundle load order

All `Cc*` capabilities load first (no deps), then all `install-*` wiring files.
This guarantees `globalThis.CcXxx` exists when each installer runs.

```
1. Pure capabilities (Cc*)    → set globalThis.CcXxx
2. Kernel wiring (install-*)  → read globalThis.CcXxx, wire onto k
3. executor.js (facade)       → create k, call all install*, run k.fillSequential()
```

## Capabilities (Cc* — 21 total)

| File | Global | Purpose |
|------|--------|---------|
| `parse-date-value.js` | `CcParseDateValue` | Date string parser |
| `cascade-field-level.js` | `CcCascadeFieldLevel` | Cascade geography semantics |
| `select-option-state.js` | `CcSelectOptionState` | Select option state readers |
| `confirm-field-pattern.js` | `CcConfirmFieldPattern` | Confirm/retype field detection |
| `ng-option-scorer.js` | `CcNgOptionScorer` | ng-dropdown option scoring |
| `ng-session-manager.js` | `CcNgSessionManager` | ng-dropdown session lifecycle |
| `build-fill-record.js` | `CcBuildFillRecord` | Fill record assembler |
| `fill-debug-emitter.js` | `CcFillDebugEmitter` | Debug event queue + batching |
| `wait-for-options.js` | `CcWaitForOptions` | Select option poller |
| `settle-after-act.js` | `CcSettleAfterAct` | Post-action settle engine |
| `resolve-cc-selector.js` | `CcResolveCcSelector` | CSS selector resolution |
| `sort-fields-by-dom-order.js` | `CcSortFieldsByDomOrder` | DOM order sort |
| `verify-fill-value.js` | `CcVerifyFillValue` | Fill value verifier |
| `detect-fill-strategy.js` | `CcDetectFillStrategy` | Fill strategy detection |
| `post-fill-corrections.js` | `CcPostFillCorrections` | Post-fill correction observer |
| `fill-one-ng.js` | `CcFillOneNg` | ng-dropdown fill logic |
| `fill-one-select.js` | `CcFillOneSelect` | Native select fill logic |
| `fill-one-date.js` | `CcFillOneDate` | Date field fill logic |
| `fill-one-radio.js` | `CcFillOneRadio` | Radio/checkbox/file fill logic |
| `fill-one-mat.js` | `CcFillOneMat` | Angular Material fill logic |
| `fill-one-text.js` | `CcFillOneText` | Text/keystroke fill logic |

## Kernel wiring (install-* — 20 total)

| File | Installs | Notes |
|------|----------|-------|
| `install-kernel-bind.js` | `bindKernelLocals(k)` | Alias mapper for all wiring files |
| `install-debug.js` | `k.emitFillDebug`, `k.flushDebugQueue` | Chrome port transport |
| `install-select-helpers.js` | `k.pushSelectRecord`, cascade + state aliases | Delegates to CcSelectOptionState, CcCascadeFieldLevel |
| `install-settle.js` | `k.settleAfterAct`, `k.waitForOptions`, `k.waitForDOMQuiet`, `k.waitForNetworkIdle` | Delegates to CcSettleAfterAct, CcWaitForOptions |
| `install-dom-order.js` | `k.getEl`, `k.PRIORITY_KEYS`, `k.entries` | Delegates to CcResolveCcSelector, CcSortFieldsByDomOrder |
| `install-strategy.js` | `k.detectStrategy`, `k.verifyValue`, `k.STRATEGY_REGISTRY` | Delegates to CcDetectFillStrategy, CcVerifyFillValue |
| `install-fill-one-ng-helpers.js` | `k._ngIsVisible`, `k._ngScoreOption`, `k._ngCancelSession`, `k._ngPickOption` | Delegates to CcNgOptionScorer, CcNgSessionManager |
| `install-fill-one-ng.js` | Handler id=`ng-dropdown` | Delegates to CcFillOneNg |
| `install-fill-one-mat.js` | Handler id=`mat` | Delegates to CcFillOneMat |
| `install-fill-one-radio-planned.js` | Handler id=`radio-planned` | Delegates to CcFillOneRadio |
| `install-fill-one-select.js` | Handler id=`select` | Delegates to CcFillOneSelect |
| `install-fill-one-choice-dom.js` | Handler id=`choice-dom` | Delegates to CcFillOneRadio |
| `install-fill-one-date.js` | Handler id=`date` | Delegates to CcFillOneDate |
| `install-fill-one-text.js` | Handler id=`text` | Delegates to CcFillOneText |
| `install-fill-one.js` | `k.fillOne`, `detectElType` | Handler chain dispatcher |
| `install-sequential.js` | `k.fillSequential` | Main fill loop |
| `install-post-fill-corrections.js` | Correction observer | Delegates to CcPostFillCorrections |
| `install-post-fill-confirm.js` | Confirm/retype mirror | Delegates to CcConfirmFieldPattern |
| `install-post-fill-mirror.js` | DOM mirror observer | Delegates to CcConfirmFieldPattern |
| `install-post-fill.js` | Post-fill orchestrator | Calls confirm + corrections + mirror |

## Running tests

```bash
# Single suite
node extension/autofill/executor/capabilities/parse-date-value.test.mjs

# All suites
for f in extension/autofill/executor/capabilities/*.test.mjs; do node "$f"; done

# Rebuild bundle
node extension/autofill/build-executor-bundle.mjs
```
