# install-sequential — Sequential Fill Loop

## Purpose
The main fill orchestrator. Iterates `k.entries` in DOM order, dispatches each field through `fillOne`, waits for settle, verifies, and writes fill records. Manages cascade sequencing, plugin integration, and budget tracking.

## Owns
- `k.fillSequential()` — the async fill loop
- Cascade settle logic (`_cascadeSettled`, `semKey` tracking)
- Budget management (`k.ajaxWaitBudgetMs`)

## Key dependencies (all injected via kernel)
`fillOne`, `verifyValue`, `detectStrategy`, `settleAfterAct`, `buildFillRecord`, `emitFillDebug`
