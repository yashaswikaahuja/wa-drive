# scan-mat-widgets — Angular Material Widget Scanner

## Purpose
Scans Angular Material widgets not captured by the standard input scan: `mat-select`, `mat-checkbox`, and `mat-radio-button`. Assigns `data-cc-id` when no `id` is present to ensure a stable selector.

## Public API (`globalThis.CcScanMatWidgets`)

### `scan(doc, existingFields, helpers, startIdx) => { formFields, labelList }`

- **existingFields** — already-captured fields; prevents double-capturing a `<select>` inside `mat-form-field`
- **startIdx** — index counter to continue from (default: `10000`)

## Field types emitted
| Type | Element |
|------|---------|
| `mat-select` | `mat-select` |
| `select` | `<select>` inside `mat-form-field` (not already captured) |
| `mat-checkbox` | `mat-checkbox` |
| `mat-radio` | `mat-radio-button` |

## Notes
- `data-cc-id` assignment mutates the DOM — intentional, used for stable selectors
- `mat-radio-button` value is set to the label text (used for matching during fill)
