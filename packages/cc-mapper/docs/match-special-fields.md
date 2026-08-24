# match-special-fields — Twin / Conditional / Agreement / File / Education

## Purpose
First-stage handlers inside `fuzzyMatch`. Handles fields that need dedicated logic before the generic alias loop.

## Public API (`globalThis.CcMatchSpecialFields`)
- `tryMatch(field, ident, matchBy, profile, helpers, mapping) => boolean`
  - `true` — field handled (mapped or skipped); caller should `continue`
  - `false` — fall through to profile matching

## Order
1. Twin (verify/retype/confirm) → skip
2. Conditional radios via `decideConditionalChoice`
3. Agreement checkboxes → auto `yes`
4. File inputs → file alias set
5. Education rows → education alias set
