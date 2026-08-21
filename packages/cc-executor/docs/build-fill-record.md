# build-fill-record — Fill Record Assembler

## Purpose

Every field fill result is stored as a `CcRecord` object in `_ccRecords` (the fill log). All records share three common envelope fields:

```js
{ ts: Date.now(), rv: RUNTIME_VERSION, fillMode: 'sequential' }
```

These three fields were previously repeated as literal object properties at every `_ccRecords.push(...)` call site — across `sequential.js` (9 sites), `select-helpers.js` (1), `fill-one-ng.js` (1), and `post-fill-confirm.js` (1). This capability is the single canonical implementation of that stamping.

---

## Public API

Registered on `globalThis.CcBuildFillRecord`:

```js
buildFillRecord(base, opts?) => CcRecord
```

### opts (all optional)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `rv` | string | `''` | RUNTIME_VERSION to stamp |
| `fillMode` | string | `'sequential'` | fill mode label |
| `now` | `() => number` | `Date.now` | Timestamp function — inject in tests |

---

## CcRecord shape

The caller provides all domain fields; this capability adds the envelope:

```js
{
  // — stamped by buildFillRecord (applied first, caller fields override) —
  ts:         number,    // opts.now() at record creation
  rv:         string,    // opts.rv
  fillMode:   string,    // opts.fillMode ('sequential')

  // — caller-provided —
  selector:   string,
  value:      string | null,
  type:       string,
  result:     'filled' | 'skipped' | 'error' | 'waiting_human',
  failReason: string | null,
  strategy:   string,
  durationMs: number,
  // ... any other call-site fields
}
```

### Field ordering: caller wins

`Object.assign({ ts, rv, fillMode }, base)` — caller fields in `base` override the envelope defaults. A caller can supply its own `ts` if needed.

---

## Behavioral fix documented

One original push site (`sequential.js`: ng-dropdown no-element skip) was **missing `fillMode`** in the original code. After migration to `buildFillRecord`, it now receives `fillMode: 'sequential'` by default. This is an intentional correction. Documented in tests.

---

## What This Capability Owns

- Stamping `ts`, `rv`, `fillMode` onto a record

## What This Capability Does NOT Own

- Pushing records to `_ccRecords` (that is `k.records.push` + `k.flushRecords`)
- Reading DOM state for `actualValue` (that is `verify-fill-value`)
- Emitting debug events after push (that is `fill-debug-emitter`)

---

## Consumers

All `_ccRecords.push(...)` call sites migrated:
- `sequential.js` — 9 sites (button, ng-dropdown, plugin, file×4, choice, error)
- `select-helpers.js` — `pushSelectRecord` (1 site)
- `fill-one-ng.js` — 1 site
- `post-fill-confirm.js` — 1 site

---

## Example

```js
const { buildFillRecord } = CcBuildFillRecord;

// Before:
_ccRecords.push({ selector, value, type, result: 'filled', strategy, durationMs,
  ts: Date.now(), rv: RUNTIME_VERSION, fillMode: 'sequential' });

// After:
_ccRecords.push(buildFillRecord({ selector, value, type, result: 'filled', strategy, durationMs },
  { rv: RUNTIME_VERSION }));
```
