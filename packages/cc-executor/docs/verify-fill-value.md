# verify-fill-value — Fill Value Verifier

## Purpose

After a fill attempt, reads the actual current DOM value of a field and compares it to the planned value to determine whether the fill succeeded. Called by the sequential fill loop after each field is filled to decide whether to count it as `'filled'` or `'skipped'`.

---

## Public API

Registered on `globalThis.CcVerifyFillValue`:

```js
verifyFillValue(selector, expected, resolveEl, settleMs?) => Promise<VerifyResult>
```

`resolveEl` is injected — use `CcResolveCcSelector.resolveCcSelector` in production, any mock in tests.

---

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `selector` | string | The cc-style selector for the field |
| `expected` | string\|null | The value that was planned/filled |
| `resolveEl` | `(sel) => Element\|null` | Element resolver (injected) |
| `settleMs` | number (optional) | Wait before reading DOM. Default: 150ms |

---

## VerifyResult

```js
{
  ok:            boolean,        // true if fill is considered successful
  actualValue:   string,         // what the DOM shows now
  normExpected:  string,         // normalised expected (lowercase, alphanumeric only)
  normActual:    string,         // normalised actual
  reason?:       string,         // why ok=false (if applicable)
  partial?:      true,           // match via partial comparison
  masked?:       true,           // match via masked-input pattern (last 4 chars)
}
```

---

## Match Rules (in order)

1. **No element found:** `ok: false`, reason `'no-element-on-verify'`
2. **Checkbox:** `ok` = `el.checked`
3. **Radio:** finds the checked input in the group, compares label text or value
4. **Select:** compares option text or value (normalised alphanumeric)
5. **Text input / textarea:**
   - Normalise both strings: lowercase + strip non-alphanumeric
   - Exact match → `ok: true`
   - Partial match (value starts with first 8+ chars of expected, or vice versa) → `ok: true, partial: true`
   - Masked input (same length, last 4 chars match) → `ok: true, masked: true`
   - Otherwise → `ok: false`

---

## What This Capability Owns

- All match logic for each input type (checkbox, radio, select, text)
- Normalised comparison (lowercase + strip non-alphanumeric)
- Partial match tolerance
- Masked input detection (Aadhaar / bank number pattern)

## What This Capability Does NOT Own

- Executing the fill (that is the widget handlers)
- Strategy name detection (that is `detect-fill-strategy`)
- Waiting for network idle (that is the wait engine)
- Record writing or debug emission

---

## Dependencies

- `resolveEl` function (injected) — the only external dependency
- DOM: `el.type`, `el.checked`, `el.value`, `el.tagName`, `el.options`, `document.querySelector` (for radio group + label lookup)
- `setTimeout` (for settle wait)
- No Chrome API, no kernel state

---

## ng-dropdown Note

`ng-dropdown` selectors (`ng-dropdown-N`) return `null` immediately. The ng-dropdown handler has its own internal verify (visual text check after clicking an option). This capability delegates to that by returning null element.

---

## Consumer

- `strategy.js` (`installStrategy`) — sets `k.verifyValue` by delegating to `CcVerifyFillValue.verifyFillValue`
- `sequential.js` — the only real caller (`await verifyValue(selector, value, settleMs)`)

---

## Examples

```js
const { verifyFillValue } = CcVerifyFillValue;
const { resolveCcSelector } = CcResolveCcSelector;

// After filling a text field:
const result = await verifyFillValue('#name', 'Ramesh Kumar', resolveCcSelector);
// => { ok: true, actualValue: 'Ramesh Kumar', normExpected: 'rameshkumar', normActual: 'rameshkumar' }

// Masked Aadhaar:
const result2 = await verifyFillValue('#aadhaar', '912345678597', resolveCcSelector);
// => { ok: true, actualValue: '****8597', masked: true }
```
