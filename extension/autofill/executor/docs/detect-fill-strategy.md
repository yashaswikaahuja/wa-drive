# detect-fill-strategy — Fill Strategy Detector

## Purpose

Given a DOM element and a type hint, returns the name of the fill strategy that applies to that element. Used to tag fill records and debug events with the strategy that was used.

This capability owns the named strategy registry and the detection logic. It does **not** execute fills or verify values — those are separate responsibilities.

---

## Public API

Registered on `globalThis.CcDetectFillStrategy`:

```js
detectFillStrategy(el, type) => string
STRATEGY_REGISTRY  // Record of strategy definitions
```

---

## `detectFillStrategy(el, type)`

Tests each strategy's `applies(el, type)` predicate in registration order. Returns the name of the first matching strategy.

**Returns:**
- The matching strategy name (`'ng-dropdown-click'`, `'mat-select-click'`, `'native-select'`, `'dwr-cascade-select'`, `'text-input'`, `'radio-click'`)
- `type` unchanged if no strategy matched and `type` is non-empty
- `'unknown'` if both `type` is empty/null and no strategy matched

Never throws — each `applies()` call is wrapped in try/catch.

---

## Strategy Registry

| Strategy | Applies when |
|----------|-------------|
| `ng-dropdown-click` | `type === 'ng-dropdown'` OR element has `ng-dropdown` CSS class |
| `mat-select-click` | `type === 'mat-select'` OR `el.tagName === 'MAT-SELECT'` |
| `native-select` | `type === 'select'` OR `el.tagName === 'SELECT'` |
| `dwr-cascade-select` | `type === 'select'` AND `el.getAttribute('data-datatype') === 'custLGDHierarchy'` |
| `text-input` | type is not in the excluded list (select, ng-dropdown, mat-*, radio*, checkbox*) |
| `radio-click` | `type` is `'radio-click'`, `'radio'`, or `'radio-group'`; OR `el.type === 'radio'` |

**Registration order matters:** `dwr-cascade-select` must come after `native-select` in the registry because DWR selects are also native selects but need special handling. Currently `native-select` comes first — if you need DWR detection, pass `type === 'dwr-cascade-select'` explicitly.

---

## What This Capability Owns

- `STRATEGY_REGISTRY` — all strategy names, applies predicates, and verify contracts
- `detectFillStrategy` — first-match dispatch logic

## What This Capability Does NOT Own

- Executing fills (owned by each fill-one-* handler)
- Verifying filled values (owned by `verifyValue` in `strategy.js`, separate responsibility)
- Element type detection for dispatch (owned by `fill-one.js` `detectElType` — overlapping, tracked)

---

## Note on Overlap with `fill-one.js detectElType`

`fill-one.js` has its own `detectElType(el, type)` function that maps elements to type strings (`'select'`, `'ng-dropdown'`, `'mat-select'`, etc.). This overlaps with the `applies()` predicates in `STRATEGY_REGISTRY`. Both functions read the same element properties. This duplication is tracked and should be resolved in a future extraction — one authoritative element type classifier.

---

## Dependencies

DOM: `el.tagName`, `el.classList`, `el.type`, `el.getAttribute`, `el.querySelector`. No Chrome API, no kernel, no async.

---

## Consumer

- `strategy.js` (`installStrategy`) — sets `k.detectStrategy` by delegating to `CcDetectFillStrategy.detectFillStrategy`
- `sequential.js` — accesses via `b.detectStrategy` from kernel

---

## Examples

```js
const { detectFillStrategy } = CcDetectFillStrategy;

detectFillStrategy(selectEl, 'select')      // 'native-select'
detectFillStrategy(matSelectEl, 'mat-select') // 'mat-select-click'
detectFillStrategy(ngDropEl, 'ng-dropdown') // 'ng-dropdown-click'
detectFillStrategy(inputEl, 'text')         // 'text-input'
detectFillStrategy(radioEl, 'radio')        // 'radio-click'
detectFillStrategy(null, 'unknown-type')    // 'unknown-type' (passthrough)
detectFillStrategy(null, null)              // 'unknown'
```
