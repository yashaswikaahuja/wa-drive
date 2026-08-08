# ADR-0005: Represent Inaccessible Contexts without Bypassing Browser Security

- Status: Accepted
- Date: 2026-08-05
- Issue: #96

## Context

Pages may contain same-origin frames, cross-origin frames, open and closed shadow roots, sandboxed documents, and contexts outside extension permissions. “Understand any webpage” cannot mean bypassing origin or browser security boundaries.

## Decision

Model browsing contexts explicitly:

- accessible top-level documents and same-origin frames are perceived as independent context roots;
- open shadow roots may be represented as child contexts tied to a host node;
- cross-origin, permission-denied, closed-shadow, and unsupported contexts are represented as opaque context records with access status and diagnostics;
- no children, text, values, or invented structure are emitted for inaccessible contexts;
- frame origins and paths follow privacy sanitization.

The extension must not use privilege escalation, script injection, or debugger APIs solely to defeat an inaccessible status. Any future privileged capture requires a separate ADR and permission/privacy review.

## Consequences

- Consumers receive honest coverage and can request human action.
- Unknown/inaccessible is a normal valid result.
- Context navigation invalidates only affected document/bindings where possible.
- Capability reporting must state which context classes were observed.

## Rejected alternatives

- **Flatten all frames into one graph without context identity:** creates collisions and unsafe targets.
- **Ignore inaccessible frames:** hides critical gaps.
- **Claim closed shadow contents from visual guesses:** violates deterministic perception.
