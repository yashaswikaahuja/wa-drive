# Sequential executor parts (`CcExecParts`)

Every file here is **≤200 lines**. The old monolith `executor.js` is a thin facade.

## Layout

| File | Role |
|------|------|
| `kernel-bind.js` | Shared locals binder |
| `debug.js` | Live `fill_debug` → SW → WSS |
| `select-helpers.js` | Options / cascade helpers |
| `settle.js` | `settleAfterAct` + waits |
| `dom-order.js` | `getEl` + DOM sort |
| `strategy.js` | Strategy registry + verify |
| `fill-one-*.js` | Widget handlers (ng / mat / select / choice / date / text) |
| `fill-one.js` | Dispatcher |
| `sequential-chunk-*.js` | Brace-balanced for-body chunks |
| `sequential.js` | Loop that joins chunks |
| `post-fill-*.js` | Corrections / confirm / mirror |
| `../executor.js` | Facade: `fillFormFieldsSequential` |

## Inject (important)

Chrome injects **one** file: `autofill/executor-bundle.js` (built from these sources).

Multi-file inject caused page errors:
`Identifier 'CcExecParts' has already been declared` → later parts never registered →
`executor_parts_not_loaded:installFillOneNgHelpers`.

Rebuild after editing any part:

```bash
node extension/autofill/build-executor-bundle.mjs
```

Then reload the extension.
