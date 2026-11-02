# pointer-keys — page mouse, hover, drag, and keyboard

## Public API

`globalThis.CcPagePointer`:

- `clickAt(spec) => { ok, action, tag, ... }`
- `pressKeys(spec) => { ok, typed, key, value, ... }`

Lives in the executor kernel with `CcClickControl` and `CcFillOneMat`. WSS injects `executor-bundle.js` then calls these from the page. MCP tools `mouse_click`, `hover`, `drag`, and `keyboard` are the transport.

## clickAt

`spec`: `x`, `y` (visible-screen CSS pixels), or `selector` from `read_form`. Optional `action` `click` | `hover` | `drag`, `button` `left` | `right` | `middle`, `count` 2 for double-click. Drag also needs `x2`,`y2` or `toSelector`.

Resolves with `CcResolveCcSelector` then `CcClickControl.elementFor`, then `querySelector` walking same-origin iframes. HTML5 drag fires `dragstart`/`drop` with `dataTransfer` and swaps two draggable columns when the page does not.

## pressKeys

`spec`: `text` to type, `key` for one named key, or `keys` for a short sequence. `selector` focuses first. Named keys: Enter, Tab, Escape, Backspace, Delete, Space, arrows, Home, End, PageUp, PageDown. Arrow keys on `input[type=range]` move the value.

Does not type into password, CAPTCHA, or OTP boxes (`blocked_field`).

## Consumer

`packages/cc-wss/src/wss-session.ts` — `pointerClickFromJson` / `keyboardFromJson` after `injectKernel`.
