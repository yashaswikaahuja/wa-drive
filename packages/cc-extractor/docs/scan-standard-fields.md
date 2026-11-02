# scan-standard-fields — Standard Input/Select/Radio/Checkbox Scanner

## Purpose
Scans all `input`, `textarea`, and `select` elements in the document. Skips non-form inputs, groups radios and non-agreement checkboxes by name, and captures select options.

## Public API (`globalThis.CcScanStandardFields`)

### `scan(doc, helpers) => { formFields, labelList }`

**helpers:** `{ isInSkipContext, getLabel, isGoodLabel }`

Returns all standard form fields found, plus a flat `labelList` array for fingerprinting.

## Skipped inputs
- Types: `hidden`, `submit`, `button`, `password`, `image`, `reset`
- Elements in skip contexts (nav/header/footer), except a visible page search box
- Inputs with `id/name/class` matching: `filter`, `token`, `csrf`, `recaptcha`
- `captcha` and `otp` are kept and marked `humanGate` (operator pause; never solved)
- Hidden `<select>` cascade children (panchayat) are kept with `optionsDynamic`
- `search` and `query` in the id, name, or class mark a page search box. That box is kept, including when it sits in the header. Its selector is its id or name, or `input[type="search"]` when that matches only one element. It is not given a `form-field-N` index.

## Field types emitted
| Type | Condition |
|------|-----------|
| `search` | `input[type=search]`, or a text box whose name, id, or placeholder is the page search |
| `text/email/tel/number/date/file` | Standard input types |
| `dropdown` | `<select>` element |
| `radio-group` | Radio buttons grouped by `name` |
| `checkbox-agreement` | Checkbox matching agree/accept/consent pattern |
| `checkbox-group` | Non-agreement checkboxes grouped by `name` |

## Radio group label resolution
1. `<legend>` inside nearest `<fieldset>`
2. Label/heading inside nearest `.form-group`, `.form-field`, `tr`, or `div`
3. Fallback: join option labels with ` / `
