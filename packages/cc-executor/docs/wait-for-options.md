# wait-for-options — Select Options DOM Poller

## Purpose

Waits for a `<select>` element to have at least `minCount` real (non-placeholder) options. Uses a MutationObserver + 200ms poll interval. Resolves with the element on success, `null` on timeout.

**Real option:** `value` is non-empty, not `'0'`, not `'-1'`.

---

## Public API

Registered on `globalThis.CcWaitForOptions`:

```js
waitForOptions(selector, minCount?, timeout?, querySelector?, observeTarget?) => Promise<Element|null>
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `selector` | required | CSS selector for the `<select>` |
| `minCount` | `1` | Minimum real options needed |
| `timeout` | `8000` | Max wait in ms |
| `querySelector` | `document.querySelector` | Injected for tests |
| `observeTarget` | `document.body` | MutationObserver target; pass `null` to disable |

---

## Consumer

`settle.js` — `waitForOptions` delegates to `CcWaitForOptions.waitForOptions`.
Also exposed on kernel as `k.waitForOptions` for `sequential.js`.

---

## Behavioral note

The real-option filter (`value !== '0' && value !== '' && value !== '-1'`) is preserved exactly from the original `settle.js` implementation.
