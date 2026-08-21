# select-option-state — Native Select Element State Reader

## Purpose

Pure DOM-reading functions for inspecting a native `<select>` element's state without modifying it. Used by the fill loop, widget handlers, and wait engine to understand what a select currently contains and whether it is ready to fill.

This capability does **not** fill selects, apply options, or wait for AJAX loads — it only reads.

---

## Public API

Registered on `globalThis.CcSelectOptionState`:

```js
isPlaceholderOption(option) => boolean
realOptions(el) => HTMLOptionElement[]
sampleOptions(el, n?) => { value: string, text: string }[]
readSelectActual(el) => { actualValue: string|null, actualOptionValue: string|null }
selectLoadMode(el) => 'static' | 'ajax' | 'unknown'
selectIsActive(el) => boolean
isPlaceholderPlanned(value) => boolean
```

---

## Function Reference

### `isPlaceholderOption(option)`

Returns `true` if the given `<option>` element is a placeholder (not a real selectable value).

**Placeholder rules (any one is sufficient):**
- `option` is `null` or `undefined`
- `option.value` is empty string, `'0'`, or `'-1'`
- `option.text` (lowercased, trimmed) is empty, `'--'`, or contains `'select'`, `'choose'`, or `'loading'`

**Returns:** `true` for null input (safe to call with any option including the first "Select..." option on government forms).

---

### `realOptions(el)`

Returns all non-placeholder options from a `<select>` element as a `HTMLOptionElement[]`.

**Returns:** `[]` for null/undefined element or elements without `.options`.

---

### `sampleOptions(el, n?)`

Returns up to `n` (default 8) non-placeholder options as plain `{ value, text }` objects for debug logging. Values truncated to 40 chars, text to 60 chars.

**Returns:** `[]` for null/empty elements.

---

### `readSelectActual(el)`

Reads the currently selected value from a `<select>` element.

| Condition | `actualValue` | `actualOptionValue` |
|-----------|--------------|---------------------|
| Non-select element or null | `null` | `null` |
| Placeholder or nothing selected | `''` | raw `option.value` or `''` |
| Real option selected | `option.text.trim()` | `option.value` |

Note: `actualValue` is the **displayed text** (what the operator sees), `actualOptionValue` is the **raw value attribute** (what the form submits).

---

### `selectLoadMode(el)`

Determines whether a `<select>` has options loaded yet.

| Return | Meaning |
|--------|---------|
| `'static'` | Has ≥1 real (non-placeholder) options |
| `'ajax'` | Empty or only placeholder options — AJAX child waiting for parent cascade |
| `'unknown'` | Null element or not a SELECT |

---

### `selectIsActive(el)`

Returns `true` if the element is present and interactable.

Checks: not null, not `disabled`, and not visibility-hidden (via `offsetParent === null` + `getClientRects().length === 0` heuristic).

**Important:** This is a DOM structure check, not a CSS visibility check. An element hidden only with `visibility: hidden` or `opacity: 0` may still return `true`. An element hidden by `display: none` on a parent will return `false`.

---

### `isPlaceholderPlanned(value)`

Returns `true` if the string value from the profile/mapping is itself a placeholder rather than a real fill value.

**Placeholder rules:** empty, `'--'`, `'0'`, `'select'`, starts with `'select '`, or contains `'please select'` (case-insensitive).

This is distinct from `isPlaceholderOption` which operates on DOM elements — this operates on profile string values.

---

## What This Capability Owns

- All seven functions above and their placeholder/state detection rules
- The exact placeholder text patterns (`'0'`, `'-1'`, `'select'`, `'choose'`, `'loading'`, `'--'`, `'please select'`)

## What This Capability Does NOT Own

- Filling or modifying select elements (that belongs to the native select fill handler)
- Cascade level identification (that belongs to `cascade-field-level`)
- Waiting for AJAX options to load (that belongs to the wait/settle engine)
- Record writing or debug telemetry

---

## Dependencies

DOM only: `el.options`, `el.selectedIndex`, `el.tagName`, `el.disabled`, `el.offsetParent`, `el.getClientRects`. No Chrome API, no kernel, no imports.

---

## Consumers

All via the kernel before this extraction:
- `sequential.js` — uses `realOptions`, `readSelectActual`, `selectLoadMode`, `selectIsActive`, `isPlaceholderPlanned`, `sampleOptions`
- `fill-one-select.js` — destructures all 7 via `bindKernelLocals(k)` (actually uses none directly)
- All other `fill-one-*.js` files — destructure via `bindKernelLocals(k)` (none actually use them)
- `post-fill-*.js` files — destructure via `bindKernelLocals(k)` (none actually use them)

After extraction: `select-helpers.js` delegates to `CcSelectOptionState`, kernel continues to expose them via `k._xxx` for existing consumers.

---

## Null / Empty / Edge Case Behavior

- All functions accept null/undefined without throwing
- `realOptions(null)` → `[]`
- `readSelectActual(null)` → `{ actualValue: null, actualOptionValue: null }`
- `selectLoadMode(null)` → `'unknown'`
- `selectIsActive(null)` → `false`
- `isPlaceholderOption(null)` → `true`
- `isPlaceholderPlanned(null)` → `true`
- `isPlaceholderPlanned(undefined)` → `true`

---

## Examples

```js
const { isPlaceholderOption, realOptions, selectLoadMode, readSelectActual, selectIsActive, isPlaceholderPlanned } = CcSelectOptionState;

// Placeholder detection
isPlaceholderOption(null)                     // true
isPlaceholderOption({ value: '', text: '' })  // true
isPlaceholderOption({ value: '0', text: 'Select State' }) // true
isPlaceholderOption({ value: 'JH', text: 'Jharkhand' })   // false

// Real options
realOptions(stateSelect)  // [option(JH), option(BR), ...]

// Load mode
selectLoadMode(districtSelect)  // 'ajax' if parent state not yet selected
selectLoadMode(stateSelect)     // 'static' if options loaded

// Selected value
readSelectActual(stateSelect)
// => { actualValue: 'Jharkhand', actualOptionValue: 'JH' }

// Planned value check
isPlaceholderPlanned('Select State')  // true
isPlaceholderPlanned('Jharkhand')     // false
isPlaceholderPlanned('0')             // true
```
