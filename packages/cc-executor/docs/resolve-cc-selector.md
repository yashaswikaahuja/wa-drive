# resolve-cc-selector — CC-Style Selector Resolver

## Purpose

Resolves a CyberControl selector string to a DOM element. Three selector formats are used by the executor to target form fields; this capability handles all three.

---

## Selector Formats

| Format | Example | Resolution rule |
|--------|---------|-----------------|
| `form-field-N` | `form-field-3` | The Nth element matching all visible form controls (inputs, selects, textareas). Zero-indexed. |
| `ng-dropdown-N` | `ng-dropdown-1` | The Nth `div.ng-dropdown` element. Zero-indexed. |
| CSS selector | `#dob`, `[name="state"]` | Passed directly to `document.querySelector`. |

---

## API

```js
// globalThis.CcResolveCcSelector
resolveCcSelector(selector: string, doc?: Document) => Element | null
```

`doc` defaults to the global `document`. Pass a custom document for testing (jsdom) or cross-frame use.

---

## Inputs

| Parameter | Type | Description |
|-----------|------|-------------|
| `selector` | string | The selector string to resolve |
| `doc` | Document (optional) | Document to query against. Defaults to global `document`. |

---

## Outputs

`Element | null` — the matched DOM element, or `null` if not found.

---

## Ownership

**Owns:**
- The three selector format patterns and their resolution rules
- The `form-field-N` query string (all visible form control types)
- Returning null on out-of-bounds index or no match
- Making the document injectable for testing

**Does not own:**
- Element type detection (that belongs to the widget dispatch capability)
- DOM-order sorting (that is a separate capability)
- Any fill logic
- Any cascade or form-field knowledge

---

## Dependencies

DOM only: `document.querySelectorAll`, `document.querySelector`. No Chrome API, no kernel, no executor state.

---

## Behavioral Notes

- `form-field-N` queries all visible input types including `input:not([type])` and textarea and select. Hidden inputs (`type="hidden"`) are excluded by the query.
- Index is parsed with radix 10 (`parseInt(n, 10)`). Selector values like `form-field-03` still resolve correctly.
- Out-of-bounds index: returns `undefined` from the NodeList. Callers must treat this as null.
- Invalid CSS selector string passed to `querySelector`: throws a `SyntaxError`. Callers should catch if untrusted input is possible.
- `ng-dropdown-N` targets `div.ng-dropdown` only — not `mat-select` or other custom components.

---

## Behavioral Differences Found in the Three Current Implementations

| Location | parseInt call | Difference |
|----------|--------------|------------|
| `dom-order.js getEl` | `parseInt(sel.split('-')[2])` | No radix — relies on implicit decimal |
| `fill-one.js resolveEl` | `parseInt(selector.split('-')[2], 10)` | Explicit radix 10 ✓ |
| `sequential.js` inline | `parseInt(selector.split('-')[2])` | No radix — relies on implicit decimal |

In practice: no behavioral difference because `form-field-N` values are always decimal. The extracted implementation uses radix 10 (correct).

---

## Current Consumers (three)

1. `dom-order.js` (`getEl`) — used in DOM-order sort of fill entries
2. `fill-one.js` (`resolveEl`) — used in the fillOne dispatcher to resolve element before dispatch
3. `sequential.js` (inline) — used in the main fill loop to resolve element per field

After extraction, all three call `CcResolveCcSelector.resolveCcSelector`.

---

## Unknown / Null Behavior

- Null or undefined selector: `startsWith` will throw — callers must pass a string. This matches current behavior (all callers pass strings from mapping keys).
- Empty string `''`: no format matches, falls through to `querySelector('')` which throws `SyntaxError`. Current behavior unchanged.
- Selector with valid format but no matching element: returns null/undefined. Sequential loop skips the field.

---

## Examples

```js
// form-field-N
resolveCcSelector('form-field-0')  // first input/select/textarea
resolveCcSelector('form-field-5')  // sixth form control
resolveCcSelector('form-field-99') // null if fewer than 100 controls

// ng-dropdown-N
resolveCcSelector('ng-dropdown-0') // first div.ng-dropdown
resolveCcSelector('ng-dropdown-2') // third ng-dropdown

// CSS selector
resolveCcSelector('#dateOfBirth')
resolveCcSelector('[name="district"]')
resolveCcSelector('.state-select')

// With injected document (for testing)
resolveCcSelector('form-field-0', jsdomDocument)
```
