# fill-one-mat — Angular Material Fill Handler

## Public API

`globalThis.CcFillOneMat`: `fillMat(el, value, elType) => 1 | 0 | null`

Returns `null` for non-mat types (pass-through).

## mat-select

Opens overlay via trigger click, waits 400ms, matches `mat-option` text (exact → startsWith → reverseStartsWith → includes), clicks. Fire-and-forget — always returns 1.

## mat-checkbox

Toggles click if `shouldCheck !== isChecked`. `shouldCheck` = `/yes|true|1|on|checked/i`.

## mat-radio

Clicks if `label === v || label.includes(v) || v.includes(label)`.

## Consumer

`fill-one-mat.js` (executor) — registered in `k.fillOneHandlers`.
