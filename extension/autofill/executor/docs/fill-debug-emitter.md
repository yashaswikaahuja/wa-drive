# fill-debug-emitter — Debug Event Queue + Emitter

## Purpose

Assembles fill debug events, batches them in a 40ms coalescing queue, and flushes them to an injected sender. Used by the sequential fill loop and fill handlers to report progress to the DevTools debug panel.

The sender is injected at construction time — in production it wraps `chrome.runtime.connect` / `sendMessage`; in tests it's a plain array collector.

---

## Public API

Registered on `globalThis.CcFillDebugEmitter`:

```js
createEmitter(opts) => emitter
```

### opts

| Field | Type | Description |
|-------|------|-------------|
| `getRunId` | `() => string` | Returns current `fillRunId` |
| `getRv` | `() => string` | Returns `RUNTIME_VERSION` |
| `getHostname` | `() => string` | Optional. Defaults to `location.hostname` |
| `send` | `(events: Array) => void` | Batch sender (receives up to 40 events) |

### emitter

| Member | Description |
|--------|-------------|
| `emit(event, payload)` | Enqueue event + flush immediately if high-priority |
| `flush()` | Flush queue immediately (cancel pending timer) |
| `queue` | Read-only getter — pending events not yet sent |

---

## Event Shape

Each event in the batch:

```js
{
  event:     string,   // e.g. 'fill.start', 'field.done', 'field.fail'
  fillRunId: string,   // from getRunId()
  hostname:  string,   // from getHostname()
  ts:        number,   // Date.now()
  rv:        string,   // from getRv()
  ...payload,          // caller-provided fields
  fieldType: string,   // renamed from payload.type (if present) to avoid envelope clash
}
```

`payload.type` is always renamed to `fieldType` to avoid clashing with the Chrome message envelope's `type` field. This matches the original `debug.js` behavior.

---

## Flush Rules

| Condition | Behavior |
|-----------|----------|
| `event === 'fill.start'` | Flush immediately |
| `event === 'fill.end'` | Flush immediately |
| `queue.length >= 6` | Flush immediately |
| Otherwise | Schedule 40ms deferred flush |
| `flush()` called | Cancel timer, flush now |

Batches are capped at 40 events per send call. If queue has more, next flush is re-scheduled.

---

## What This Capability Owns

- Event object assembly (shape, field renaming)
- Queue management (enqueue, splice, batch cap)
- Flush scheduling (40ms timer, immediate-flush decision)

## What This Capability Does NOT Own

- Chrome transport (`chrome.runtime.connect`, `port.postMessage`, `sendMessage`)
- Kernel state (`fillRunId`, `RUNTIME_VERSION`) — these are passed in via `opts`
- Decision of when to emit events (that is the sequential loop and fill handlers)

---

## Consumer

- `debug.js` (`installDebug`) — creates one emitter per kernel instance, wires Chrome transport as `send`, exposes `k.emitFillDebug` and `k.flushDebugQueue`

---

## Example

```js
const { createEmitter } = CcFillDebugEmitter;

const sent = [];
const emitter = createEmitter({
  getRunId: () => 'run-123',
  getRv: () => '5.70',
  getHostname: () => 'serviceonline.bihar.gov.in',
  send: (batch) => sent.push(...batch),
});

emitter.emit('fill.start', { totalFields: 12 });
// => sent immediately (fill.start is high-priority)

emitter.emit('field.done', { selector: '#name', type: 'text-input', planned: 'Ramesh' });
// => scheduled (40ms)
```
