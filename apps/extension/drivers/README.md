# CyberControl Driver API

This is the **browser ISA** for CyberControl: low-level primitives that observe or mutate the page. Built so that an AI agent (running in the hub backend) can drive a browser through stable, JSON-Schema-validated calls.

## Entry point

```js
window.cc.do({ name, args, options? }) // returns Promise<Result>
window.cc.run([action, action, ...])    // sequential composition
window.cc.listDrivers()                  // schemas of all available drivers
```

### Result shape

```ts
{
  ok: boolean,
  result?: any,        // driver-specific output (matches output schema)
  error?: string,      // when ok === false
  traceId: string,     // 't_<base36 ts>_<rand>'
  durationMs: number,
  driver: string,      // driver name
  timestamp: number    // start ts
}
```

### Options

| Option | Type | Effect |
|---|---|---|
| `dryRun` | boolean | For mutating drivers only — returns ok with `result: { dryRun: true }`, takes no DOM action |
| `timeout` | number | Driver-specific (most drivers have their own waitMs/timeoutMs in args) |
| `traceId` | string | Override generated traceId (for multi-step traces) |

## Drivers

### Observation (sideEffect: `observe`)

#### `dom.query`
Find elements by CSS selector OR by semantic kind+text.

```js
await cc.do({
  name: 'dom.query',
  args: { kind: 'button', text: 'Submit' }      // or { selector: '#mybtn' }
})
// → { ok: true, result: { count, elements: [{ tag, type, label, value, selector, bounds, ... }] } }
```

Args:
- `selector` (string) — CSS. Mutex with `kind`/`text`.
- `kind` (string) — one of `button|link|input|select|textarea|checkbox|radio|any`
- `text` (string) — case-insensitive substring of textContent
- `limit` (int) — default 10
- `includeHidden` (bool) — default false

#### `dom.read`
Read full state of one element.

```js
await cc.do({ name: 'dom.read', args: { selector: '#aadhaarInput' } })
// → result: { found, tag, type, value, label, attrs, bounds, visible, disabled, ... }
```

#### `dom.snapshot`
List all visible interactive elements. Use to give an agent context.

```js
await cc.do({ name: 'dom.snapshot', args: { kinds: ['input', 'button'] } })
// → result: { url, title, elementCount, elements: [...] }
```

### Mutation (sideEffect: `mutate`)

#### `input.type`
Type a value via real keystroke event sequence (keydown→beforeinput→input(insertText)→keypress→keyup per char). Triggers Aadhaar/OTP/masked-input validators correctly. Dispatches Tab+focusout at end so site Tab-handlers run (RTPS Hindi transliteration etc).

```js
await cc.do({ name: 'input.type', args: { target: '#fullName', value: 'Sandhya Kumari' } })
// → result: { before, actualValue, verified }
```

#### `input.clear`
Clear an input/textarea.

#### `input.focus`
Focus + scroll into view.

#### `select.option`
Pick an option from a dropdown. Auto-detects native `<select>`, `ng-select`, `mat-select`. Match by text (case-insensitive, contains).

```js
await cc.do({ name: 'select.option', args: { target: 'select#state', value: 'Bihar' } })
// → result: { strategy: 'native-select', selectedText, selectedValue }
```

#### `select.cascade`
Like `select.option` but waits for AJAX network idle first (parent-populated dependent dropdown). Use for state→district→block chains.

#### `click`
Click an element. Returns `{ clicked, navigated, urlBefore, urlAfter }`.

```js
await cc.do({ name: 'click', args: { target: 'button[type="submit"]' } })
```

### Wait (sideEffect: `observe`)

#### `wait.element`
Wait for selector to appear and be visible. Default timeout 8000ms.

#### `wait.networkIdle`
Wait until in-flight fetch+XHR count is 0 and stays quiet for `quietMs`. Reads counters from `network-monitor.js` running in MAIN world.

#### `wait.ms`
Fixed delay. Use sparingly — prefer state-based waits.

## Composition

```js
await cc.run([
  { name: 'click', args: { target: 'button[name="agree"]' } },
  { name: 'wait.element', args: { selector: '#registerForm', timeoutMs: 5000 } },
  { name: 'input.type', args: { target: '#aadhaar', value: '729027826597' } },
  { name: 'select.option', args: { target: 'select#state', value: 'Bihar' } },
])
// → { ok, steps: [{traceId,...}, ...] }
```

By default, `cc.run` stops on first failure. Pass `options.continueOnError: true` per step to override.

## Trace recording

Every `cc.do(...)` call appends an entry to `window._ccTraces` (capped at 100) and flushes the last 25 to `document.body.dataset.ccTraces` (so a hub-side recorder reading via CDP gets recent traces without needing direct script-eval access).

Trace entry:
```ts
{ traceId, action, result, ts }
```

## Invariants

- **Schema-validated input.** Bad args return `ok: false, error: 'invalid-args: ...'` without running the driver.
- **Async-everywhere.** Every driver returns a Promise.
- **Idempotent observation.** `dom.*`, `wait.*` never mutate.
- **Deterministic mutation.** Same `input.type` call on the same element produces the same result (modulo framework state). Re-running is safe.
- **No direct hub calls.** Drivers don't know about the hub. The hub-bridge wraps `cc.do` separately.

## Adding a new driver

```js
window.cc.registerDriver({
  name: 'mycategory.action',
  description: 'What it does, when to use, what it returns.',
  sideEffect: 'observe' | 'mutate' | 'navigate',
  input: { type: 'object', properties: { ... }, required: [...] },
  output: { type: 'object' },
  handler: async function (args, ctx) {
    // ctx = { traceId, options }
    // throw on errors — dispatcher catches and returns { ok:false, error: e.message }
    return { ... }; // matches output schema
  },
});
```

Place the file under `extension/drivers/<category>.js` (one file per logical group). Add it to `popup.js` and `background.js` injection lists.

## Versioning

Schemas follow this rule:
- **Adding a property** to input/output: minor (forward compat).
- **Renaming or removing** a property: major (breaks consumers).
- **Behavior change** (e.g. `click` now scrolls by default): minor if backward-compat, major otherwise.

The hub auto-discovers drivers via `cc.listDrivers()` on page load. So the hub stays in sync with whatever the extension exposes.

## How AI integration works (Phase 2 — not yet built)

```
hub /api/agent/plan
  ├─ reads cc.listDrivers() (extension publishes via WebSocket bridge)
  ├─ converts to OpenAI tool schemas
  ├─ calls Groq with goal + tools + page snapshot
  ├─ Groq returns tool_call: { name: 'input.type', args: {...} }
  ├─ hub posts action to extension via WS bridge
  ├─ extension runs cc.do(action), returns result
  └─ loop until done or operator confirms
```

The driver layer is the trust boundary: AI can only do what drivers expose. Adding a new capability = writing a new driver = explicit code review.
