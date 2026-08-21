# install-debug — Chrome Debug Port Wiring

## Purpose
Wires `CcFillDebugEmitter` to the Chrome extension runtime. Creates one emitter per kernel instance using `chrome.runtime.connect` as the sender. Exposes `k.emitFillDebug` and `k.flushDebugQueue`.

## Owns
- `ensureDebugPort()` — lazy Chrome port creation with disconnect listener
- `chromeSend(batch)` — port.postMessage + sendMessage fallback
- Kernel wiring: `k.emitFillDebug`, `k.flushDebugQueue`

## Delegates to
- `CcFillDebugEmitter` (CAP-9) — event queue, batching, flush rules
