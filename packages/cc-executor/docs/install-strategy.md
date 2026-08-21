# install-strategy — Strategy + Verify Wiring

## Purpose
Wires strategy detection and fill value verification onto the kernel.

## Delegates to
- `CcDetectFillStrategy` (CAP-7) — `k.detectStrategy`, `k.STRATEGY_REGISTRY`
- `CcVerifyFillValue` (CAP-8) — `k.verifyValue`
