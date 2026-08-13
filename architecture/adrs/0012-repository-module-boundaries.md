# ADR-0012: Repository Module Boundaries (facades over big-bang moves)

- Status: Proposed (architecture_draft for phase_3_7 / conceptual 3.9 / #164)
- Date: 2026-08-12
- Issue: #164
- Relates: ownership.yml, frozen phase_3_0–3_6 modules, Policy A numbering

## Context

CyberControl’s extension and service trees accumulated product and legacy paths. Some files (popup, background, legacy executor, gateway, edge-factory) mix multiple architectural concerns. A big-bang directory rewrite would break inject lists, global facades, frozen contracts, and CI without improving clarity.

## Decision

1. **Responsibility-driven decomposition**, not line-count targets.
2. **Stable facades** (`CcPerception`, `CcDomGateway`, `CcNavigationContract`, `CcActionPlanExecutor`, popup entry, background message API) remain the public composition boundary during migration.
3. **Extract internals behind facades** with green unit + product-path Chromium E2E before removing the old body.
4. **Legacy autofill is quarantined** — not reorganized into perception; not expanded on the product path.
5. **Target folders** in the hardening contract are directional; empty ceremony directories are forbidden.
6. **Dependency direction** is one-way: UI → application → runtime → perception → gateway. Service planning stays in extension-service.

## Consequences

- Implementation is multi-PR and reversible per facade.
- Governance (CHECK-015) can enforce forbidden imports.
- Frozen phase modules can still be split internally if facades and tests preserve semantics.

## Rejected alternatives

- **Big-bang move everything in one PR:** high regression risk.
- **Split only by line count:** creates wrong boundaries.
- **Merge service planning into extension for convenience:** violates eyes/hands vs brain.
