# install-settle — Settle Engine + Wait Utilities Wiring

## Purpose
Wires post-action settle engine and wait utilities onto the kernel.

## Delegates to
- `CcSettleAfterAct` (CAP-14) — `settleAfterAct`, `waitForSelectOptionsSequential`
- `CcWaitForOptions` (CAP-13) — `waitForOptions`

## Owns
- `waitForDOMQuiet(ms)` — MutationObserver-based DOM quiet detection (not extracted)
- `waitForNetworkIdle` — thin wrapper around `window.ccWaitForNetworkIdle`
