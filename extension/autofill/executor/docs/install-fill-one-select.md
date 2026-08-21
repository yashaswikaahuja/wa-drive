# install-fill-one-select — Native Select Handler Registration

## Purpose
Registers the `select` handler in `k.fillOneHandlers`. Delegates all fill logic to `CcFillOneSelect`.

## Delegates to
- `CcFillOneSelect` (CAP-16) — option matching, event sequence, retry, AI fallback
