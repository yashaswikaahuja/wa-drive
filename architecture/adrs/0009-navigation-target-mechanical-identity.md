# ADR-0009: Mechanical Navigation Targets (no selectors, no business goals)

- Status: Proposed (architecture_draft for phase_3_5 / #145)
- Date: 2026-08-10
- Issue: #145
- Relates: ADR-0001 (public IR / private bindings), ADR-0007 (service no selectors), gateway-security allow_navigation

## Context

The service needs to drive “click the control that navigates” without receiving browser-private locators or requiring the browser to choose workflow meaning.

## Decision

1. **Public target identity** for navigation steps is exactly ActionPlan v3 `Target`: `{ context_id, node_id }`, under `target_binding` `{ document_id, snapshot_id, expected_revision }`.

2. **Mechanical action** is `op: activate` with `required_affordance: activate` when applicable. Authorization requires `allow_navigation: true` when the resolved element implies navigation (link/location change). `allow_submit` remains orthogonal.

3. **Private resolution** uses BindingRegistry + authorship `binding_generation` equality immediately before act (lifecycle rebinding_continuity). Mismatch → `stale_target`. No silent rebind.

4. **Browser ownership** ends at observing affordances, executing activate, and reporting mechanical outcomes. **Service ownership** selects which candidate node satisfies the workflow goal.

5. **Forbidden on the wire:** selectors, XPath, DOM handles, raw HTML, private bindings, full href with query/fragment/credentials, business `workflow_intent` / `business_step_id` as execution identity.

## Consequences

- Malicious plans cannot smuggle selectors as navigation destinations.
- Unknown/opaque/inaccessible navigation remains valid IR (unsupported/inaccessible status or context.access).
- ActionPlanExecutor remains supporting infrastructure; this ADR does not create a new phase for the executor.

## Rejected alternatives

- **Service sends href/url destination for browser to find:** reintroduces locator search and privacy risk.
- **Browser picks “the Next button” by label synonyms:** business semantics in perception.
- **Semantic fingerprint as execution identity:** advisory only; not an execution key.
