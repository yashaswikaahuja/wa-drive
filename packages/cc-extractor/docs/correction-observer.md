# correction-observer — Post-Fill Correction + Enrichment Listeners

## Purpose
Installs two event listeners after autofill completes — one to capture user corrections to filled fields, one to capture values the user enters in fields the extension missed.

## Public API (`globalThis.CcCorrectionObserver`)

### `inject(mapping, filledBySource, profile, backendUrl, formKey, doc?)`

| Param | Type | Description |
|-------|------|-------------|
| `mapping` | object | `{ selector: { value } }` — what was filled |
| `filledBySource` | object | `{ selector: { semanticKey, profileKey } }` |
| `profile` | object | `{ profileKey: value }` — full profile |
| `backendUrl` | string | Backend base URL (null = no POST) |
| `formKey` | string | Form identifier |
| `doc` | Document | Optional, defaults to `document` |

## Correction listener
- Watches each filled field for `change` events
- If new value differs from original, finds matching `profileKey` in `profile`
- Saves to `sessionStorage._cc_corrections`
- POSTs to `backendUrl/mappings/formKey` after **1500ms debounce**

## Enrichment listener
- Watches unfilled `input`/`textarea` elements for `blur` events
- Skips: select/checkbox/radio/hidden/submit/button, labels matching captcha/otp/password/confirm
- Validates by semantic type (dob, pincode, mobile, aadhaar, name)
- Saves to `sessionStorage._cc_enrichments`

## Semantic aliases (contract — do not change)
`full name → name`, `date of birth → dob`, `mobile no → mobile`, `pin code → pincode`, `aadhaar no → aadhaar_number`, `email id → email`

## Validation rules (contract)
| Key | Rule |
|-----|------|
| `dob` | `DD/MM/YYYY` |
| `pincode` | 6 digits |
| `mobile` | 10 digits |
| `aadhaar_number` | 12 digits |
| `name`, `father_name`, `mother_name` | 2–60 alpha+space+dot |
| other | 2–200 chars |
