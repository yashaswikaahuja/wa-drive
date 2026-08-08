# ADR-0002: Use Immutable Snapshots with Revisioned Deltas

- Status: Accepted
- Date: 2026-08-05
- Issue: #96

## Context

Government portals mutate after cascades, wizard transitions, validation, and SPA rerenders. A mutable or one-time PageModel cannot establish which page state an ActionPlan targets.

## Decision

A PageSnapshot is immutable and identified by `document_id`, `snapshot_id`, and monotonic `revision`. Changes publish an ordered PageDelta against an exact base snapshot/revision, or a replacement snapshot when a delta is unsafe or too large.

Execution targets carry an expected revision. Revision, document, binding, and adapter preconditions are checked before action. A mismatch stops execution and requests a new snapshot and service re-plan.

Full navigation creates a new document identity and invalidates old bindings. Same-document navigation retains document identity and increments revision when public IR changes.

## Consequences

- Plans are reproducible against a named observed state.
- Consumers must handle `revision_mismatch`, `stale_snapshot`, and `document_replaced`.
- Mutation processing needs coalescing, canonical comparison, and bounded history.
- Service caches must be keyed by schema/document/snapshot identity, not URL alone.

## Rejected alternatives

- **Always mutate one shared model:** creates races and untraceable plans.
- **Full snapshot after every mutation:** simple but unbounded on dynamic pages.
- **Trust selectors to re-resolve:** can target the wrong control after rerendering.
