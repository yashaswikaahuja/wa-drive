# install-post-fill-mirror — DOM Mirror Observer

## Purpose
After fills settle (3s delay), attaches input listeners on primary fields so when an operator manually fills them, the corresponding confirm/retype sibling is automatically mirrored. Also flushes the final `data-cc-records` attribute.

## Delegates to
- `CcConfirmFieldPattern` (CAP-5) — confirm field detection
