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
- `captcha` and `otp` are kept and marked `humanGate` (operator pause; never solved). Ids such as `mobileotp` match OTP even without a word boundary.
- Hidden `<select>` cascade children (panchayat) are kept with `optionsDynamic`
- Address/office cascade dropdowns after the parent (`district`, `sub_division`, `block`, `police_station`, …) stay `optionsDynamic` even when the current page already has options loaded
- AJAX selects: empty/placeholder, `disabled`, `data-url` / `data-parent` / `data-depends`, parent `onchange` that names this field, `ng-select` / `mat-select`
- Persist must store `options: "dynamic"` for those fields and must not freeze a later snapshot of loaded `<option>` nodes
- `search` and `query` in the id, name, or class mark a page search box. That box is kept, including when it sits in the header. Its selector is its id or name, or `input[type="search"]` when that matches only one element. It is not given a `form-field-N` index. Page search is `fillMode: skip` so SSC/RRB chrome search is not filled.
- `guessCanonicalKey` matches **Full Name / Candidate Name** on the visible label (not `^full name$` on the joined blob). ng-select/mat-select fields go through `decorateField` so Gender / Education Board / Year of Passing get canonical keys.
- Fieldset legends like “Country Of Nationality” yield to the widget placeholder/nearby when the control is a date or retype-father/mother field. A nearby legend that is still the heading is not kept as the field label.
- `#agree` / agreement checkboxes are `checkbox-agreement`, never `aadhaar_number`.
- Readonly datepicker inputs (`DD/MM/YYYY`, Date Of Birth) stay `fillMode: fill`.
- Carousel `slide-dot-*` / swiper pagination boxes are skipped (they are not OTP).
- Yes/No radios whose name is `changedName` take the group label **Changed Name**, not the first option **Yes**.
- `input[type=tel]` maps to canonicalKey `mobile` unless the control is an OTP box. A live **Mobile Number** label must never bind `dob`.

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
