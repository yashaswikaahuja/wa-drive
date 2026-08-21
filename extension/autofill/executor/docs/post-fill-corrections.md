# post-fill-corrections — Operator Correction Observer

## Public API

`globalThis.CcPostFillCorrections`: `installCorrectionsObserver(opts)`

## opts

| Field | Default | Description |
|-------|---------|-------------|
| `entries` | `[]` | `[selector, fieldData]` pairs from fill mapping |
| `filledBySource` | `{}` | Field metadata by selector |
| `allFields` | `[]` | All detected fields (unmapped included) |
| `getEl` | `document.querySelector` | Element resolver |
| `records` | `[]` | Fill records for strategy/plugin lookup |
| `settleDelayMs` | `10000` | Delay before snapshotting (ms) |

## Behavior

1. After `settleDelayMs`: snapshot all field DOM values
2. On submit-button click (`/submit|save|next|continue|proceed|finalize/i`) → `postCorrections('submit')`
3. On `beforeunload` → `postCorrections('unload')`
4. Corrections = fields where `currentVal !== snapshotVal && currentVal !== ''`
5. `correctionType`: `'override'` if had a value, `'completion'` if was empty

## Consumer

`post-fill-corrections.js` (executor) — calls `installCorrectionsObserver` with kernel context.
