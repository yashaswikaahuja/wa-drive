# action-plan-fill — ActionPlan (APE) Fill Path

## Purpose
Product DYNAMIC fill path. Six stages:

1. **Inject** — PRODUCT_PATH_SCRIPTS if not already loaded
2. **Allowlist** — seed navigation origin allowlist
3. **Perceive** — CcPerception.perceivePage → page_snapshot
4. **Plan** — POST /fill-plan → ActionPlan
5. **Execute** — CcActionPlanExecutor.execute + DOM evidence
6. **Report** — POST /fill-observation + POST /sessions

## Public API (`globalThis.CcActionPlanFill`)
- `run(ctx)` → `Promise<result>`
