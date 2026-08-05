# ADR-0004: Scope Perception Identity to Document Lifetimes

- Status: Accepted
- Date: 2026-08-05
- Issue: #96

## Context

IR v1 claims field IDs are stable across reloads using DOM ID, name, label hashes, and indexes. Real portals contain duplicate IDs, repeated sections, generated names, localization, and dynamic insertion. Cross-reload identity cannot be guaranteed deterministically.

## Decision

Use distinct identities:

- `document_id`: one active Document lifetime;
- `snapshot_id`: one immutable complete snapshot;
- `revision`: monotonic public-IR change within a document;
- `node_id`: structural identity scoped to `document_id`, stable best-effort across that document’s revisions;
- `binding_generation`: private counter for live-node replacement;
- semantic fingerprint: non-authoritative service-side correspondence hint.

No node ID is promised stable across reloads. Cross-page or cross-session matching is service reasoning backed by knowledge/evidence, never browser identity.

## Consequences

- The browser can prove target freshness within a document.
- The service must not persist node IDs as durable portal knowledge.
- Repeated and duplicate-ID controls remain distinguishable.
- Plans need document and revision preconditions.

## Rejected alternatives

- **CSS path as stable identity:** layout changes break it.
- **Label hash as stable identity:** duplicates and translations collide.
- **Global semantic key as node identity:** meaning and occurrence are different concepts.
