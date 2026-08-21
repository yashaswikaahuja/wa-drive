# sort-fields-visual — Visual Position Sort

## Purpose
Sorts `formFields[]` by true rendered position using `getBoundingClientRect`. Handles multi-column layouts, CSS flex/grid reordering, and custom widgets that diverge from DOM order.

## Public API (`globalThis.CcSortFieldsVisual`)

### `sort(formFields) => formFields`
Mutates in-place. Reassigns `.index`. Returns the same array reference.

### `ROW_BAND = 8`
Exported constant. Fields within 8px vertically are treated as the same row, then sorted left-to-right within that row.

## Algorithm
1. Compute `{ row, left }` for each field via `getBoundingClientRect`
2. `row = Math.round(top / ROW_BAND)` — quantises vertical position into row buckets
3. Sort by `(row ASC, left ASC)`
4. Reassign `.index` 0…N, delete `._pos`

## Unrendered fields
Fields with `width=0, height=0, top=0, left=0` (display:none or not in DOM) are sent to the end with `{ row: 1e9, left: 1e9 }`.

## Notes
- `_el` references must still be present when `sort()` is called
- `_el` is stripped by `CcFingerprintForm.fingerprint()` after sort
- Similar to executor's `CcSortFieldsByDomOrder` but uses geometry, not DOM tree order
