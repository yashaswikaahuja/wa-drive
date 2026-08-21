# fill-one-radio — Radio, Checkbox, File Fill Handler

## Public API

`globalThis.CcFillOneRadio`: `fillRadio(el, selector, value, type, elType, filledBySource) => 1 | 0 | null`

## Dispatch table

| type/elType | Behavior |
|-------------|----------|
| `type='radio-click'` | Direct click on radio input |
| `type='radio-group'` + `elType='radio'` | Normalised match + gender synonyms |
| `elType='radio'` | DOM name-group match by value/label |
| `elType='checkbox'` | Boolean-like values only; non-boolean → 0 |
| `el.type='file'` | base64 only; URL deferred to sequential loop |
| anything else | `null` (pass-through) |

## Gender synonyms

`female/महिला/स्त्री` and `male/पुरुष` — matches label text containing Hindi or English variants.

## Consumers

- `fill-one-choice-dom.js` (executor) — radio DOM + checkbox + file handlers
- `fill-one-radio-planned.js` (executor) — radio-click + radio-group handlers
