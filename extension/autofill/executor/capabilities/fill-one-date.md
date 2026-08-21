# fill-one-date — Date Field Fill Handler

## Public API

`globalThis.CcFillOneDate`: `fillDate(el, selector, value) => 1 | 0 | null`

Returns `null` if not a date widget.

## Widget dispatch

| Detection | Handler |
|-----------|---------|
| `el._flatpickr` or `flatpickr-input` class | `fp.setDate(dateObj, true)` |
| `hasDatepicker` class or jQuery datepicker data | `$(el).datepicker('setDate')` |
| `matdatepicker` attr or `matInput` in mat-form-field | native setter + `dateChange`/`dateInput` events |
| `el.type` = date/datetime-local/month/week | ISO conversion via `CcParseDateValue`, native setter |

## Dependencies

- `CcParseDateValue.parseDateValue` — already extracted as CAP-6

## Consumer

`fill-one-date.js` (executor) — registered in `k.fillOneHandlers`.
