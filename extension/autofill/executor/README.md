# autofill/executor

Sequential fill kernel. Injected into web pages as a single bundle.

## Structure

```
autofill/
├── executor.js                  ← Facade. Entry point: fillFormFieldsSequential()
├── executor-bundle.js           ← AUTO-GENERATED. Do not edit. Injected into pages.
├── build-executor-bundle.mjs    ← Build script. Run: node build-executor-bundle.mjs
└── executor/
    ├── docs/                    ← Documentation (.md) for all capabilities and wiring files
    ├── capabilities/
    │   ├── Cc*.js               ← Pure capability modules (21 files)
    │   ├── Cc*.test.mjs         ← Tests (plain Node .mjs, no framework)
    │   └── install-*.js         ← Kernel wiring installers (20 files)
    └── README.md                ← This file
```

## Naming convention

| Prefix | Role |
|--------|------|
| `Cc*` | Pure capability — sets `globalThis.CcXxx`, no kernel dependency, fully testable |
| `install-*` | Kernel wiring — calls `CcExecParts.installXxx(k)`, picks up `CcXxx` globals and wires onto the kernel object `k` |

## Bundle load order

All `Cc*` capabilities load first (no deps), then all `install-*` wiring files.
This guarantees `globalThis.CcXxx` exists when each installer runs.

```
1. Pure capabilities (Cc*)    → set globalThis.CcXxx
2. Kernel wiring (install-*)  → read globalThis.CcXxx, wire onto k
3. executor.js (facade)       → create k, call all install*, run k.fillSequential()
```

## Capabilities (Cc* — 21 total)

| File | Global | Docs |
|------|--------|------|
| `parse-date-value.js` | `CcParseDateValue` | [docs](docs/parse-date-value.md) |
| `cascade-field-level.js` | `CcCascadeFieldLevel` | [docs](docs/cascade-field-level.md) |
| `select-option-state.js` | `CcSelectOptionState` | [docs](docs/select-option-state.md) |
| `confirm-field-pattern.js` | `CcConfirmFieldPattern` | [docs](docs/confirm-field-pattern.md) |
| `ng-option-scorer.js` | `CcNgOptionScorer` | [docs](docs/ng-option-scorer.md) |
| `ng-session-manager.js` | `CcNgSessionManager` | [docs](docs/ng-session-manager.md) |
| `build-fill-record.js` | `CcBuildFillRecord` | [docs](docs/build-fill-record.md) |
| `fill-debug-emitter.js` | `CcFillDebugEmitter` | [docs](docs/fill-debug-emitter.md) |
| `wait-for-options.js` | `CcWaitForOptions` | [docs](docs/wait-for-options.md) |
| `settle-after-act.js` | `CcSettleAfterAct` | [docs](docs/settle-after-act.md) |
| `resolve-cc-selector.js` | `CcResolveCcSelector` | [docs](docs/resolve-cc-selector.md) |
| `sort-fields-by-dom-order.js` | `CcSortFieldsByDomOrder` | [docs](docs/sort-fields-by-dom-order.md) |
| `verify-fill-value.js` | `CcVerifyFillValue` | [docs](docs/verify-fill-value.md) |
| `detect-fill-strategy.js` | `CcDetectFillStrategy` | [docs](docs/detect-fill-strategy.md) |
| `post-fill-corrections.js` | `CcPostFillCorrections` | [docs](docs/post-fill-corrections.md) |
| `fill-one-ng.js` | `CcFillOneNg` | [docs](docs/fill-one-ng.md) |
| `fill-one-select.js` | `CcFillOneSelect` | [docs](docs/fill-one-select.md) |
| `fill-one-date.js` | `CcFillOneDate` | [docs](docs/fill-one-date.md) |
| `fill-one-radio.js` | `CcFillOneRadio` | [docs](docs/fill-one-radio.md) |
| `fill-one-mat.js` | `CcFillOneMat` | [docs](docs/fill-one-mat.md) |
| `fill-one-text.js` | `CcFillOneText` | [docs](docs/fill-one-text.md) |

## Kernel wiring (install-* — 20 total)

| File | Installs | Docs |
|------|----------|------|
| `install-kernel-bind.js` | `bindKernelLocals(k)` | [docs](docs/install-kernel-bind.md) |
| `install-debug.js` | `k.emitFillDebug`, `k.flushDebugQueue` | [docs](docs/install-debug.md) |
| `install-select-helpers.js` | `k.pushSelectRecord`, cascade + state aliases | [docs](docs/install-select-helpers.md) |
| `install-settle.js` | `k.settleAfterAct`, `k.waitForOptions`, `k.waitForDOMQuiet`, `k.waitForNetworkIdle` | [docs](docs/install-settle.md) |
| `install-dom-order.js` | `k.getEl`, `k.PRIORITY_KEYS`, `k.entries` | [docs](docs/install-dom-order.md) |
| `install-strategy.js` | `k.detectStrategy`, `k.verifyValue`, `k.STRATEGY_REGISTRY` | [docs](docs/install-strategy.md) |
| `install-fill-one-ng-helpers.js` | `k._ngIsVisible`, `k._ngScoreOption`, `k._ngCancelSession`, `k._ngPickOption` | [docs](docs/install-fill-one-ng-helpers.md) |
| `install-fill-one-ng.js` | Handler id=`ng-dropdown` | [docs](docs/install-fill-one-ng.md) |
| `install-fill-one-mat.js` | Handler id=`mat` | [docs](docs/install-fill-one-mat.md) |
| `install-fill-one-radio-planned.js` | Handler id=`radio-planned` | [docs](docs/install-fill-one-radio-planned.md) |
| `install-fill-one-select.js` | Handler id=`select` | [docs](docs/install-fill-one-select.md) |
| `install-fill-one-choice-dom.js` | Handler id=`choice-dom` | [docs](docs/install-fill-one-choice-dom.md) |
| `install-fill-one-date.js` | Handler id=`date` | [docs](docs/install-fill-one-date.md) |
| `install-fill-one-text.js` | Handler id=`text` | [docs](docs/install-fill-one-text.md) |
| `install-fill-one.js` | `k.fillOne`, `detectElType` | [docs](docs/install-fill-one.md) |
| `install-sequential.js` | `k.fillSequential` | [docs](docs/install-sequential.md) |
| `install-post-fill-corrections.js` | Correction observer | [docs](docs/install-post-fill-corrections.md) |
| `install-post-fill-confirm.js` | Confirm/retype mirror | [docs](docs/install-post-fill-confirm.md) |
| `install-post-fill-mirror.js` | DOM mirror observer | [docs](docs/install-post-fill-mirror.md) |
| `install-post-fill.js` | Post-fill orchestrator | [docs](docs/install-post-fill.md) |

## Running tests

```bash
# Single suite
node extension/autofill/executor/capabilities/parse-date-value.test.mjs

# All suites
for f in extension/autofill/executor/capabilities/*.test.mjs; do node "$f"; done

# Rebuild bundle
node extension/autofill/build-executor-bundle.mjs
```
