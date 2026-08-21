# run-product-fill — Fill Path Router

## Purpose
Routes to the correct fill path based on `ctx.executionPreference`:
- `DYNAMIC` → `CcActionPlanFill.run(ctx)`
- All others (AUTO, STATIC, SEQUENTIAL) → `CcSequentialKernelFill.run(ctx)`

## Public API (in facade `fill-orchestrator.js`)
- `runProductFill(ctx)` → `Promise<result>`
