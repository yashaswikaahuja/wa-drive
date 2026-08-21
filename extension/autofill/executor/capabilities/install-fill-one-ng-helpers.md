# install-fill-one-ng-helpers — ng-dropdown Kernel Helpers

## Purpose
Installs shared ng-dropdown helpers on the kernel: `k._ngIsVisible`, `k._ngScoreOption`, `k._ngCancelSession`, `k._ngPickOption`.

## Delegates to
- `CcNgOptionScorer` (CAP-11) — `k._ngScoreOption`, `k._ngPickOption`
- `CcNgSessionManager` (CAP-12) — `k._ngCancelSession`
