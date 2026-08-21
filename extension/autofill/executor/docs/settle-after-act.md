# settle-after-act — Post-Action Settle Engine

## Purpose

After a fill action, waits for the page network to reach a quiet state before proceeding to the next field. Manages an `ajaxWaitBudgetMs` budget to prevent infinite waits on slow portals.

---

## Public API

Registered on `globalThis.CcSettleAfterAct`:

```js
createSettleEngine(opts) => { settleAfterAct, waitForSelectOptionsSequential }
```

### opts

| Field | Description |
|-------|-------------|
| `waitForNetworkIdle(quietMs, maxMs)` | Network idle detector (injected) |
| `waitForOptions(selector, minCount, timeout)` | Option poller — `CcWaitForOptions` |
| `getBudget()` | Returns current `ajaxWaitBudgetMs` |
| `setBudget(n)` | Writes current `ajaxWaitBudgetMs` |

---

## settleAfterAct(kind, opts?)

| kind | kick delay | maxNet | quiet |
|------|-----------|--------|-------|
| `'text'` | — | — | flat 100ms, no network poll |
| `'choice'` | 200ms | 3500ms | 120ms |
| `'select'` | 200ms | 4500ms | 150ms |
| `'button'` | 300ms | 5000ms | 120ms |

Budget caps `maxNet` to `max(300, budget)`.

Returns `{ kind, idle, waitedMs, ... }`.

## waitForSelectOptionsSequential(selector, maxMs)

Settles 'choice' first (covers radio→ajax-select cascade), then polls for options via `waitForOptions`. Budget is decremented by total elapsed time.

---

## Consumer

`settle.js` — creates one engine per kernel instance, wires `k.ajaxWaitBudgetMs` as budget get/set.
