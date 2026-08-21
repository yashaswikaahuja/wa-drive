# scan-standard-fields — Standard Input/Select/Radio/Checkbox Scanner

## Purpose
Scans all `input`, `textarea`, and `select` elements in the document. Skips non-form inputs, groups radios and non-agreement checkboxes by name, and captures select options.

## Public API (`globalThis.CcScanStandardFields`)

### `scan(doc, helpers) => { formFields, labelList }`

**helpers:** `{ isInSkipContext, getLabel, isGoodLabel }`

Returns all standard form fields found, plus a flat `labelList` array for fingerprinting.

## Skipped inputs
- Types: `hidden`, `submit`, `button`, `search`, `password`, `image`, `reset`
- Elements in skip contexts (nav/header/footer)
- Inputs with `id/name/class` matching: `search`, `query`, `filter`, `captcha`, `otp`, `token`, `csrf`, `recaptcha`

## Field types emitted
| Type | Condition |
|------|-----------|
| `text/email/tel/number/date/file` | Standard input types |
| `dropdown` | `<select>` element |
| `radio-group` | Radio buttons grouped by `name` |
| `checkbox-agreement` | Checkbox matching agree/accept/consent pattern |
| `checkbox-group` | Non-agreement checkboxes grouped by `name` |

## Radio group label resolution
1. `<legend>` inside nearest `<fieldset>`
2. Label/heading inside nearest `.form-group`, `.form-field`, `tr`, or `div`
3. Fallback: join option labels with ` / `
