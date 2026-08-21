# install-post-fill-confirm — Confirm/Retype Field Mirror

## Purpose
After primary fills settle (4s delay), finds confirm/retype fields (via `CcConfirmFieldPattern`) and mirrors the primary field's DOM value into them. Fires input/change/blur events.

## Delegates to
- `CcConfirmFieldPattern` (CAP-5) — `isConfirmField`, `getBaseId`

## Side effects
Pushes a `confirm-mirror` fill record to `_ccRecords`.
