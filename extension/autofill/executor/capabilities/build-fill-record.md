# build-fill-record — Fill Record Assembler

## Purpose

Every field fill result is stored as a `CcRecord` object in `_ccRecords` (the fill log). All records share three common envelope fields:

```js
{ ts: Date.now(), rv: RUNTIME_VERSION, fillMode: 'sequential' }
```

These three fields were previously repeated as literal object properties at every `_ccRecords.push(...)` call site — 20+ times across `sequential.js`, `select-helpers.js`, `post-fill-confirm.js`, and `fill-one-ng.js`. This capability centralises that stamping logic.

---

## Public API

Registered on `globalThis.CcBuildFillRecord`:

```js
buildFillRecord(base, opts?)             => CcRecord
buildFilledRecord(fields, opts?)         => CcRecord   result='filled'
buildSkippedRecord(fields, opts?)        => CcRecord   result='skipped'
buildErrorRecord(fields, opts?)          => CcRecord   result='error'
buildWaitingHumanRecord(fields, opts?)   => CcRecord   result='waiting_human'
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
  // — caller-provided —
  selector:   string,
  value:      string | null,
  type:       string,
  result:     'filled' | 'skipped' | 'error' | 'waiting_human',
  failReason: string | null,
  strategy:   string,
  durationMs: number,
  // ... any other call-site fields

  // — stamped by buildFillRecord —
  ts:         number,    // Date.now() at record creation
  rv:         string,    // RUNTIME_VERSION
  fillMode:   string,    // 'sequential'
}
```

### Field ordering note

`Object.assign({ ts, rv, fillMode }, base)` means caller fields in `base` override the envelope defaults. This allows callers to supply their own `ts` if needed (e.g. for retry records with a corrected timestamp).

---

## What This Capability Owns

- Stamping `ts`, `rv`, `fillMode` onto a record
- Typed helpers for each result variant

## What This Capability Does NOT Own

- Pushing records to `_ccRecords` (that is `k.records.push` + `k.flushRecords`)
- Reading DOM state for `actualValue` (that is `verify-fill-value`)
- Emitting debug events after push (that is `fill-debug-emitter`)

---

## Consumer

All `_ccRecords.push(...)` call sites in:
- `sequential.js` (9 inline pushes)
- `select-helpers.js` (`pushSelectRecord`)
- `fill-one-ng.js`
- `post-fill-confirm.js`

The integration wires `k.buildFillRecord = CcBuildFillRecord.buildFillRecord` so existing consumers can adopt it incrementally.

---

## Example

```js
const { buildFilledRecord, buildSkippedRecord, buildErrorRecord } = CcBuildFillRecord;

const opts = { rv: '5.70' };

// Before:
_ccRecords.push({ selector, value, type, result: 'filled', strategy, durationMs, ts: Date.now(), rv: RUNTIME_VERSION, fillMode: 'sequential' });

// After:
_ccRecords.push(buildFilledRecord({ selector, value, type, strategy, durationMs }, opts));
```
