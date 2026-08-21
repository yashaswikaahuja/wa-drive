# confirm-field-pattern — Confirm/Retype Field Identifier

## Purpose

Identifies whether an HTML input field is a confirm/retype field — a duplicate field asking the user to re-enter the same value as another field for verification (e.g. "Confirm Password", "Retype Email"). Also derives the base field ID that the confirm field corresponds to, enabling lookup of the primary field.

Used by the post-fill passes to propagate autofilled values into confirm fields and to mirror live operator edits.

---

## Public API

Registered on `globalThis.CcConfirmFieldPattern`:

```js
isConfirmField(id, label?) => boolean
getBaseId(id) => string
CONFIRM_PREFIX_PATTERN  // RegExp — exposed for consumers
CONFIRM_LABEL_PATTERN   // RegExp — exposed for consumers
```

---

## `isConfirmField(id, label?)`

Returns `true` if the field is a confirm/retype field.

**Rules (any one is sufficient):**
- The field's `id` (or `name`) matches `CONFIRM_PREFIX_PATTERN`
- The field's label text matches `CONFIRM_LABEL_PATTERN`

**Returns `false`** for empty or null id (even if label matches — without an id there is no base field to find).

---

## `getBaseId(id)`

Strips the confirm prefix from an id to derive the base field id.

Strips these prefixes in order (each with optional trailing underscore):
1. `c{letter}` — e.g. `cPassword` → `Password`
2. `confirm_?` — e.g. `confirm_password` → `password`, `confirmEmail` → `Email`
3. `retype_?` — e.g. `retypePassword` → `Password`
4. `re_?type_?` — e.g. `re_type_email` → `email`
5. `re_?enter_?` — e.g. `re_enter_mobile` → `mobile`
6. `verify_?` — e.g. `verifyEmail` → `Email`

Returns the original string unchanged if no prefix matches.

---

## Recognized Prefix Patterns

| Prefix | Example ID | Base ID |
|--------|-----------|---------|
| `c{letter}` | `cPassword` | `Password` |
| `confirm` | `confirmPassword` | `Password` |
| `confirm_` | `confirm_email` | `email` |
| `retype` | `retypeEmail` | `Email` |
| `retype_` | `retype_mobile` | `mobile` |
| `re_type` | `re_typeEmail` | `Email` |
| `re_type_` | `re_type_dob` | `dob` |
| `re_enter` | `re_enterMobile` | `Mobile` |
| `re_enter_` | `re_enter_email` | `email` |
| `verify` | `verifyEmail` | `Email` |
| `verify_` | `verify_mobile` | `mobile` |

---

## What This Capability Owns

- `CONFIRM_PREFIX_PATTERN` and `CONFIRM_LABEL_PATTERN` regexes — single authoritative source
- `isConfirmField` logic
- `getBaseId` stripping logic

## What This Capability Does NOT Own

- Finding the confirm field in the DOM (that requires the document)
- Propagating values into confirm fields (that is post-fill-confirm.js)
- Live mirroring (that is post-fill-mirror.js)
- Any DOM interaction

---

## Dependencies

None. Pure JS — no DOM, no Chrome, no kernel.

---

## Previous Duplication

This logic was written identically in two places:
- `post-fill-confirm.js` line 23–33
- `post-fill-mirror.js` line 22–34

Both used the same `confirmPatterns` regex and the same `baseId` strip chain. After extraction both delegate to this capability.

---

## Consumers

- `post-fill-confirm.js` — uses `isConfirmField` + `getBaseId` to find and fill confirm fields
- `post-fill-mirror.js` — uses `isConfirmField` + `getBaseId` to identify confirm fields for live mirroring

---

## Null / Edge Case Behavior

- `isConfirmField(null)` → `false`
- `isConfirmField('')` → `false`
- `isConfirmField('cPassword', null)` → `true` (id match, label not needed)
- `isConfirmField('email', 'Confirm Email')` → `true` (label match)
- `getBaseId(null)` → `''`
- `getBaseId('email')` → `'email'` (no prefix — unchanged)
- `getBaseId('cPassword')` → `'Password'`

---

## Examples

```js
const { isConfirmField, getBaseId } = CcConfirmFieldPattern;

isConfirmField('confirmPassword')   // true
isConfirmField('retypeEmail')       // true
isConfirmField('email')             // false
isConfirmField('email', 'Confirm Email Address')  // true (label match)

getBaseId('confirmPassword')  // 'Password'
getBaseId('cEmail')           // 'Email'
getBaseId('re_enter_mobile')  // 'mobile'
getBaseId('dob')              // 'dob' (unchanged — not a confirm field)
```
