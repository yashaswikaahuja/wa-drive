# install-dom-order — DOM Order + Element Resolution Wiring

## Purpose
Installs element resolution and DOM-ordered field entries on the kernel. Derives PRIORITY_KEYS from cascade geography keywords. Delegates sorting to `CcSortFieldsByDomOrder`.

## Owns
- `k.getEl` — wired to `CcResolveCcSelector.resolveCcSelector`
- `k.PRIORITY_KEYS` — flat keyword array for cascade field detection
- `k.entries` — DOM-sorted `[selector, fieldData]` pairs

## Delegates to
- `CcResolveCcSelector` (CAP-2) — selector resolution
- `CcSortFieldsByDomOrder` (CAP-4) — DOM order sort
