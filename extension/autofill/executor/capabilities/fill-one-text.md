# fill-one-text — Text / Keystroke Fill Handler

## Purpose

Fills text inputs and textareas. Uses `window.keystrokeFillSync` (primary) or native value-set + event dispatch (legacy fallback). Handles the ServicePlus/RTPS Bihar Hindi transliteration side-effect.

## Public API

Registered on `globalThis.CcFillOneText`:

```js
fillText(el, value) => 1 | 0
```

## Fill paths

1. **Primary** — `window.keystrokeFillSync(el, value)` — mimics real typing (keydown/beforeinput/input/keyup). Required by Aadhaar/OTP/captcha fields.
2. **Legacy fallback** — native value setter + event dispatch (when keystrokeFillSync not loaded).

## Hindi sibling (ServicePlus/RTPS Bihar)

When `el.getAttribute('data-type') === 'fullName'` and the next sibling has `data-type='text'`, waits 500ms then calls Google Transliteration API if the sibling is still empty.

## Consumer

`fill-one-text.js` — registered handler in `k.fillOneHandlers`.
