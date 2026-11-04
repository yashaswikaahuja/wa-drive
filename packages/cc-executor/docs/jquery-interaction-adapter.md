# jQuery interaction adapter

## Purpose

`CcJQueryInteractionAdapter` provides a small compatibility layer for pages that register jQuery event handlers. It lives in `@cc/executor` and is bundled with the existing extension executor.

## Execution model

Chrome extension content scripts run in an isolated JavaScript world. The page's `window.jQuery` is therefore not guaranteed to be visible to the extension. The adapter checks for jQuery only in its current execution world:

- When available, `setValue()` uses `.val()` and `trigger()` uses `.trigger()`.
- When unavailable, `setValue()` uses the native input/textarea value setter and `trigger()` dispatches bubbling DOM events.
- Native DOM events reach page handlers registered with jQuery `.on()`, `.change()`, `.input()`, and delegated `.on(event, selector, handler)` because jQuery registers DOM listeners.
- `triggerHandler()` is available only when jQuery is directly accessible. It does not bubble and has no faithful native-DOM equivalent.

## API

- `isJQueryAvailable()` — whether jQuery is visible in the current execution world.
- `setValue(element, value, { events })` — set and verify a value; event dispatch is opt-in because jQuery `.val()` does not automatically emit `change`.
- `trigger(element, eventName, detail?)` — trigger a jQuery event when possible, otherwise dispatch a native bubbling event.
- `triggerHandler(element, eventName, detail?)` — invoke jQuery handlers on this element only; returns an explicit unavailable result if jQuery cannot be accessed.
- `click(element)` — call the element's native `.click()` method.

## Limitations

Synthetic events are not trusted user gestures and cannot satisfy browser security requirements such as user activation. Use the browser-input adapter for trusted pointer/keyboard interaction, file chooser activation, or controls that require real user input. jQuery namespaced events and special plugin semantics may not be reproduced by the native fallback. Always verify the resulting application state rather than treating event dispatch as proof of success.

## Tests

```sh
pnpm --filter @cc/executor test
pnpm --filter @cc/executor typecheck
```
