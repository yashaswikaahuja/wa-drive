# ADR-0003: Restrict DOM Access through Observation and Interaction Ports

- Status: Accepted
- Date: 2026-08-05
- Issue: #96

## Context

The literal rule “only Perception may touch the DOM” conflicts with execution, which must focus, type, activate, and verify controls. Allowing every browser module to inspect DOM causes duplicate widget detection and lets planning logic leak into the extension.

## Decision

New Phase 3 structural DOM access is centralized in a Browser DOM Gateway:

- **ObservationPort** supplies bounded read-only DOM/ARIA/geometry/context facts to Perception.
- **InteractionPort** performs a requested mechanical action through a private binding and returns only the required postcondition.

Perception alone interprets structure. Execution cannot perform page-wide discovery, infer labels, reclassify widgets, or choose alternate targets. Service modules never access either port.

Existing DOM access is grandfathered only for migration and cannot be expanded. CI checks added JavaScript lines against `architecture/dom-access-policy.yml`.

## Consequences

- “Eyes” and “hands” remain browser-local without making execution a second perception engine.
- Adapters operate behind the interaction port.
- Gateway APIs become security-sensitive and require contract tests.
- Legacy executor/resolver/plugin DOM access must be removed incrementally.

## Security placement (Phase 3.0.1 refinement)

The gateway and its private binding table live in the extension's **isolated
world**. They are not installed on the page's `window` and there is no
page-callable `window.ccDomGateway`. Gateway operations are invoked only through
extension-internal channels, are capability-scoped to the authorizing plan's
targets, and revalidate exact revision plus `binding_generation` immediately
before acting (TOCTOU protection). The full threat model, page-to-extension
bridge hardening, and credential-handling rules are in
`architecture/gateway-security.yml`.

## Rejected alternatives

- **Perception returns live Elements to execution:** bypasses the boundary and cannot serialize safely.
- **Service sends selectors:** makes the brain browser-specific.
- **Execution detects widget types on demand:** duplicates perception and produces inconsistent classifications.
- **Page-reachable `window.ccDomGateway`:** rejected as a privileged generic DOM remote controllable by hostile page scripts.
