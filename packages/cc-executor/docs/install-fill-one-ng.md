# install-fill-one-ng — ng-dropdown Handler Registration

## Purpose
Registers the `ng-dropdown` handler in `k.fillOneHandlers`. Delegates all fill logic to `CcFillOneNg`.

## Delegates to
- `CcFillOneNg` (CAP-20) — overlay detection, session, poll loop, verify
- `CcNgSessionManager` (CAP-12) — session lifecycle (via fallback in this file)
