# install-select-helpers — Select State + Cascade + Record Wiring

## Purpose
Wires select-state functions, cascade geography, and `pushSelectRecord` onto the kernel.

## Delegates to
- `CcSelectOptionState` (CAP-3) — `isPlaceholderOption`, `realOptions`, `sampleOptions`, `readSelectActual`, `selectLoadMode`, `selectIsActive`, `isPlaceholderPlanned`
- `CcCascadeFieldLevel` (CAP-1) — `cascadeSemanticKey`, `CASCADE_PARENTS`
- `CcBuildFillRecord` (CAP-10) — record stamping in `pushSelectRecord`

## Owns
- `pushSelectRecord(base)` — stamps record, pushes to `k.records`, emits debug event
