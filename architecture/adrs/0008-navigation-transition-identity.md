# ADR-0008: Navigation Transition Identity (document vs revision)

- Status: Proposed (architecture_draft for phase_3_5 / #145; budgets clarified #147)
- Date: 2026-08-10
- Issue: #145 / #147
- Relates: ADR-0002 (immutable snapshots), ADR-0004 (perception identity), ADR-0005 (cross-origin contexts)

## Context

Portals navigate via full reloads, SPA route changes, frame loads, and redirects. Phase 3.0 lifecycle already distinguishes full vs same-document vs frame navigation, but Phase 3.5 needs an explicit, reviewable rule for how those transitions appear in public IR and how ActionPlan execution fails closed.

## Decision

1. **Identity-effect classification.** Navigation is classified by its effect on public identity, not by framework name:
   - **Full document:** new top-level `document_id`, revision baseline 0, all old-document bindings invalidated.
   - **Same-document route/SPA/history:** retain `document_id`, strictly increase `revision` when public IR or `page.path` / `page.route_key` changes.
   - **Frame document:** replace only that frame `Context.document_id` and invalidate bindings for that context’s document.
   - **In-document structure only** (tabs/accordion/dialog without URL identity change): may keep `document_id`; revision increases only if public IR changes.

2. **Plans never span document identities.** An ActionPlan’s `target_binding.document_id` is exact. After full navigation, continuation with the same plan is `document_replaced`.

3. **Redirects** collapse to the settled final origin + sanitized `page.path` under privacy rules within `max_redirect_hops` (10) and `settle_deadline_ms` (8000); intermediate hops are browser-private wait details, not public multi-hop IR.

4. **Cross-origin / inaccessible contexts** remain opaque (`Context.access`); no fabricated `transitions_to` into them. Destination origin policy still applies at activate.

5. **New browsing contexts** (`target=_blank`, `window.open`) do not change the origin document’s `document_id`; report `navigation_new_context` and do not invent IR for the new context unless separately discovered.

## Consequences

- Service must re-perceive after `document_replaced` or `stale_snapshot`.
- Browser must not invent business “step completed” from a route change.
- PageDelta is valid only within the same `document_id`; full navigation publishes a new snapshot.

## Rejected alternatives

- **URL as plan target identity:** leaks query secrets and is not stable for execution.
- **Always new document_id on SPA change:** destroys revision continuity without benefit.
- **Dangling transitions_to off-snapshot:** forbidden by frozen edge authority (#131–#134).
