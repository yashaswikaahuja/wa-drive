# install-fill-one — fillOne Dispatcher

## Purpose
Installs `k.fillOne(selector, value, type)` — the main fill dispatch function. Resolves the element, detects its type via `detectElType`, then runs registered handlers in order until one returns a result.

## Owns
- `detectElType(el, type)` — element type classifier for dispatch
- `k.fillOne` — handler chain dispatcher

## Handler chain (registered by other install- files)
`ng-dropdown` → `mat` → `radio-planned` → `select` → `choice-dom` → `date` → `text`
