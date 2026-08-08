# ADR-0001: Separate Public Page IR from Browser-Private Bindings

- Status: Accepted
- Date: 2026-08-05
- Issue: #96

## Context

IR v1 serializes CSS selectors and option selectors. Selectors are browser implementation details, become stale, and would make service intelligence depend on DOM shape. Execution still needs a live target.

## Decision

Maintain two models:

1. **Public Page IR** — serialized PageSnapshot/PageDelta containing document-scoped node IDs, observable facts, evidence, and affordances. It contains no selector, XPath, HTML, DOM handle, or private binding identifier.
2. **Private BindingTable** — memory-only extension state mapping `(document_id, node_id)` to a live node reference, adapter ID, binding generation, and creation revision.

ActionPlans reference `document_id`, `snapshot_id`, `node_id`, and `expected_revision`. The browser resolves these internally. Missing or stale bindings produce `stale_target`; there is no selector fallback in IR v2.

## Consequences

- The service remains browser-independent.
- Navigation and rerendering require explicit stale-target recovery.
- IR v1 is wire-incompatible and needs the migration policy under `architecture/ir-migrations/`.
- Browser tests must validate that private binding keys never serialize.

## Rejected alternatives

- **Keep selectors as hidden optional fields:** eventually creates service coupling and accidental persistence.
- **Make semantic labels execution identity:** ambiguous and language-dependent.
- **Persist browser node handles:** handles are lifecycle-bound and not portable.
