# Extension engines vs product Fill (debug branch doc)

**Do not confuse “files in the repo” with “what Fill Form runs.”**

## Active product Fill (operator side-panel button) — v5.92.x

```
popup Fill Form
  → CcFillOrchestrator.runProductFill
      → inject PRODUCT_PATH_SCRIPTS (errors, gateway, perception, APE, …)
      → CcPerception.perceivePage
      → POST /api/fill-plan
      → CcActionPlanExecutor.execute
           → resolveExecutionTarget (bindings)
           → CcDomGateway.performAction
           → postcondition
      → POST /api/fill-observation
```

This is the **only** path the Fill button uses when legacy is gated off.

## Still in tree but NOT product Fill (5.92)

| Engine | Role |
|---|---|
| `autofill/executor.js` + plugins | Legacy client fill (5.91-style sessions) |
| `drivers/*` | Legacy agent / teach inject |
| Agent UI | Permanently disabled (Phase 4.1) |
| `background` DISPATCH_JOB inject list | Legacy stack if that message path is used |

Session **path hint**:

- `selector` / `strategy` / `actualValue` → **legacy** engine records  
- `nodeId` / `stepId` / `planId` → **ActionPlan** product path  

## Mental model for debugging

When version is **5.92.0** and records are APE-style, do **not** start in autofill/.  
Start in: **orchestrator → inject → perception resolve → gateway → postcondition**.
