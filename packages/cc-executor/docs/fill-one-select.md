# fill-one-select — Native Select Fill Handler

## Public API

`globalThis.CcFillOneSelect`: `fillSelect(el, selector, value, mapping) => 1 | 0 | null`

Returns `null` if `el.tagName !== 'select'`.

## Fill sequence

1. `findOpt(allOptions)` via `window.ccMatchOption`
2. If found: `applySelect(el, opt)` — native setter + full event sequence
3. If not found: 200ms retry interval (up to 15 attempts)
4. After 15 attempts with no match: AI LLM fallback via `window.ccLLM`

## Re-apply timers

- 300ms: re-apply if framework reset
- 700ms: extra change event
- 3500ms: DWR cascade re-apply (ServicePlus Bihar pattern)

## Consumer

`fill-one-select.js` (executor) — registered in `k.fillOneHandlers`.
