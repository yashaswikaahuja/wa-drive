# fingerprint-form — Form Fingerprinting + PageModel Assembly

## Purpose
Produces two stable form identifiers and an optional PageModel from a scanned field set. Strips `_el` DOM references from all fields (not serialisable across the `chrome.scripting.executeScript` boundary).

## Public API (`globalThis.CcFingerprintForm`)

### `fingerprint(formFields, labelList, opts) => { formKey, semanticFormKey, pageModel }`

**opts:** `{ hostname, title, ccModels?, url? }`

**Side effect:** strips `_el` from every field in `formFields`.

## formKey
`djb2(hostname + '::' + title + '::' + top10SortedLabels)`

Fast, DOM-structure-sensitive. Uses top 10 sorted labels from `labelList`.

## semanticFormKey
`'s_' + djb2(hostname + '|' + top15NormalizedLabels)`

Stable across DOM changes. Uses top 15 sorted, lowercased, non-alphanumeric-stripped labels from `formFields[].label`. Prefixed `s_`.

## pageModel
Built via `ccModels.createPageModel(fieldData, meta)` if `ccModels` is provided. Returns `null` otherwise.

## Hash algorithm
djb2: `hash = ((hash << 5) - hash) + charCode; hash |= 0`

**Do not change** — `formKey` values are stored in the backend.
