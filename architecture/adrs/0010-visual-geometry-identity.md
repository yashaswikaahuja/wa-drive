# ADR-0010: Visual Geometry Identity (stable nodes under layout change)

- Status: Proposed (architecture_draft for phase_3_6 / conceptual 3.8 / #158)
- Date: 2026-08-12
- Issue: #158
- Relates: ADR-0002 (immutable snapshots), ADR-0004 (perception identity), ADR-0006 (screenshots), phase_3_3 graph authority

## Context

Layout geometry changes constantly (scroll, resize, reflow, animation). Visual Context must give planners spatial evidence without destroying identity: node_id, document_id, private bindings, and plan targets must remain stable under pure layout motion.

## Decision

1. **Geometry is an attribute of a node, not its identity.** Changing `Node.geometry` MUST NOT change `node_id`, `document_id`, or binding generation.

2. **Published geometry participates in revision and canonical_hash.** When `include_geometry` is true and geometry is part of the published public IR, material geometry changes that are published MUST advance `revision`. High-frequency thrash SHOULD be coalesced under `publish_debounce_ms`.

3. **PageDelta prefers field updates.** Geometry-only motion updates the existing node rather than replace/remove/add cycles that churn identity.

4. **Coordinate space is document CSS pixels + `page.viewport` metadata** (frozen Page IR). Absolute screen coordinates and device pixels without DPR are prohibited in public IR.

5. **Virtualized / unrealized content is not invented.** Absence from the realized accessibility/DOM tree yields omission or an opaque diagnostic, never a synthetic visual node with guessed geometry.

6. **Visual edges do not override structural/a11y authority.** `visually_groups_with` and `overlays` are visual evidence only; `parent_id`/`contains` and `labels`/`controls` remain authoritative for hierarchy and naming.

## Consequences

- Planners can use viewport_intersection and visible without rebinding targets after scroll.
- Services must treat geometry as ephemeral layout state, not durable business structure.
- Progressive occlusion graphs must respect edge and node budgets.

## Rejected alternatives

- **New node_id per layout frame:** destroys ActionPlan targeting and binding stability.
- **Geometry-only private channel outside Page IR:** splits the public contract and invites smuggling.
- **Screenshots as identity:** rejected by ADR-0006.
