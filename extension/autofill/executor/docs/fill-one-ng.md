# fill-one-ng — ng-dropdown Fill Handler

## Public API

`globalThis.CcFillOneNg`: `fillNg(el, selector, value, type, elType, ctx) => 1 | 0 | null`

Returns `null` if not ng-dropdown type. Returns `0` if no adapter found. Returns `1` (fire-and-forget).

## ctx fields

`{ portalAdapters, filledBySource, _replayResults, _ccRecords, RUNTIME_VERSION, _flushRecords }`

## Fill sequence

1. Cancel previous session (`CcNgSessionManager.cancelSession`)
2. Create new session (`CcNgSessionManager.createSession`)
3. `trigger.click()` — open dropdown
4. `MutationObserver` + stabilization wait (150ms quiet)
5. Overlay detection (addedNodes → OVERLAY_TAGS → optionsContainer)
6. Poll every 300ms: score options via `CcNgOptionScorer.scoreOption`
7. On match (score ≥ 50): click + verify loop (200ms, max 3s)
8. On verify ok or timeout: `CcNgSessionManager.cleanupSession` + `CcBuildFillRecord`

## Dependencies

- `CcNgOptionScorer` (CAP-11) — option scoring
- `CcNgSessionManager` (CAP-12) — session lifecycle
- `CcBuildFillRecord` (CAP-10) — record stamping

## Consumer

`fill-one-ng.js` (executor) — registered in `k.fillOneHandlers`.
