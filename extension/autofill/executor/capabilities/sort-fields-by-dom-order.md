# sort-fields-by-dom-order — Fill Entry DOM Order Sorter

## Purpose

Sorts an array of `[selector, fieldData]` fill entries into the visual top-to-bottom order they appear in the page using `compareDocumentPosition`. This ensures the fill loop processes fields in the order the form's own validation logic expects — typically the same order a real user would tab through the form.

---

## Public API

Registered on `globalThis.CcSortFieldsByDomOrder`:

```js
sortFieldsByDomOrder(entries, resolveEl) => entries (sorted in place)
```

---

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `entries` | `Array<[string, object]>` | Fill mapping entries — each is `[selector, fieldData]` |
| `resolveEl` | `(selector: string) => Element\|null` | Injected resolver — should be `CcResolveCcSelector.resolveCcSelector` or equivalent |

---

## Return Value

The same `entries` array, sorted in place. Also returned for chaining convenience.

---

## Sorting Rules

- Two elements that are both present: sorted by `compareDocumentPosition` — earlier in DOM comes first
- One or both elements not found (resolveEl returns null): their relative order is preserved (sort returns 0)
- Same element resolved for both selectors: preserved order (sort returns 0)
- `compareDocumentPosition` not available on element: preserved order (sort returns 0) — defensive for non-standard environments

---

## What This Capability Owns

- The sort algorithm using `compareDocumentPosition`
- The `DOCUMENT_POSITION_FOLLOWING` constant handling (falls back to `4` if Node is not defined)
- Null safety for missing elements

## What This Capability Does NOT Own

- Element resolution (injected via `resolveEl` parameter — owned by `resolve-cc-selector`)
- Cascade field classification (owned by `cascade-field-level`) — `PRIORITY_KEYS` is a consumer of cascade knowledge, not owned here
- The fill mapping itself (owned by the executor facade)
- Any fill logic

---

## PRIORITY_KEYS Note

The original `dom-order.js` also sets `k.PRIORITY_KEYS` — a flat array of cascade-geography keywords used by `sequential.js` to classify whether a field is cascade-dependent. This is **not** DOM ordering logic — it is a projection of cascade knowledge for use in the sequential loop.

`PRIORITY_KEYS` is derived from the same keywords owned by `cascade-field-level`. It remains in `dom-order.js` as a kernel bridge (sets `k.PRIORITY_KEYS`) until the sequential loop is refactored to call `cascade-field-level` directly. It is not part of this capability.

---

## Dependencies

- `resolveEl` function (injected) — the only dependency
- `compareDocumentPosition` on DOM elements (standard browser API)
- `Node.DOCUMENT_POSITION_FOLLOWING` constant (falls back to `4` if unavailable)

No Chrome API, no kernel state, no cascade knowledge.

---

## Consumer

- `dom-order.js` (`installDomOrder`) — sets `k.entries` by calling `sortFieldsByDomOrder`

After extraction: `dom-order.js` delegates the sort to `CcSortFieldsByDomOrder.sortFieldsByDomOrder`, passing `CcResolveCcSelector.resolveCcSelector` as the resolver.

---

## Null / Edge Case Behavior

- Empty array: returns immediately, no sort attempted
- Array with one entry: returns immediately, no sort needed
- Both entries resolve to null: preserved order
- One resolves to null: preserved relative position (stable)

---

## Examples

```js
const { sortFieldsByDomOrder } = CcSortFieldsByDomOrder;
const { resolveCcSelector } = CcResolveCcSelector;

const entries = Object.entries(mapping);
sortFieldsByDomOrder(entries, resolveCcSelector);
// entries now in DOM top-to-bottom order
```
